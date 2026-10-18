import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { error } from '@sveltejs/kit';
import type { PersonnelWorkspaceRouteData } from '$features/personnel/contracts';
import type { AdmittedOrganizationRequest } from '$lib/server/adapters/requestContexts.server';

const { requests, suspendedOrganizations, acquiredRequests, createRequestPersonnelWorkspaceContextMock } = vi.hoisted(
	() => ({
		requests: new Map<string, ReturnType<typeof createTestContext>>(),
		suspendedOrganizations: new Set<string>(),
		acquiredRequests: [] as string[],
		createRequestPersonnelWorkspaceContextMock: vi.fn()
	})
);

const ORG = 'test-org';
const ORG_SEGMENT = 'public-org-name';

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);
	return {
		...actual,
		buildLayoutRequest: async (_locals: App.Locals, segment: string) => {
			acquiredRequests.push(segment);
			const orgId = segment === ORG_SEGMENT ? ORG : segment;
			if (suspendedOrganizations.has(orgId)) error(403, 'Organization is suspended');
			const ctx = requests.get(orgId);
			if (!ctx) error(404, 'Organization not found');
			return {
				auth: ctx.auth,
				audit: ctx.audit,
				store: ctx.store,
				rawStore: ctx.rawStore,
				scope: ctx.scope,
				supabase: {},
				session: null
			};
		},
		createRequestPersonnelWorkspaceContext: createRequestPersonnelWorkspaceContextMock
	};
});

vi.mock('$features/organization/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/organization/index.server')>(
		'$features/organization/index.server'
	);
	return {
		...actual,
		requireActiveOrganization: async (_locals: App.Locals, segment: string) => {
			const orgId = segment === ORG_SEGMENT ? ORG : segment;
			if (suspendedOrganizations.has(orgId)) error(403, 'Organization is suspended');
			if (!requests.has(orgId)) error(404, 'Organization not found');
			return orgId;
		}
	};
});

import { _createPersonnelLayoutLoad } from './+layout.server';

function granted<T extends object>(workspace: T): Exclude<T, { access: 'restricted' }> {
	if ('access' in workspace) throw new Error('Expected a granted workspace');
	return workspace as Exclude<T, { access: 'restricted' }>;
}

type PersonnelLoadEvent = Parameters<ReturnType<typeof _createPersonnelLayoutLoad>>[0];

function eventFor(segment = ORG_SEGMENT): PersonnelLoadEvent {
	return {
		locals: {} as App.Locals,
		cookies: {} as import('@sveltejs/kit').Cookies,
		params: { orgId: segment },
		url: new URL(`https://example.test/org/${segment}/personnel`),
		depends: vi.fn(),
		parent: () => {
			throw new Error('The Personnel layout must not run ancestor loads');
		}
	} as unknown as PersonnelLoadEvent;
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function seededContext() {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			capabilityMap: { ...createCapabilityMap('none'), personnel: 'view' }
		}
	});
	ctx.rawStore.seed('personnel', [
		{
			id: 'able',
			organization_id: ORG,
			first_name: 'Synthetic',
			last_name: 'Able',
			rank: 'SPC',
			clinic_role: 'Medic'
		}
	]);
	ctx.rawStore.seed('groups', [{ id: 'alpha', organization_id: ORG, name: 'Alpha', sort_order: 0 }]);
	ctx.rawStore.seed('status_types', [
		{
			id: 'leave',
			organization_id: ORG,
			name: 'Leave',
			color: '#ff0',
			text_color: '#000',
			sort_order: 0
		}
	]);
	ctx.rawStore.seed('organizations', [{ id: ORG, loss_warning_window_days: 90 }]);
	requests.set(ORG, ctx);
	return ctx;
}

beforeEach(() => {
	vi.clearAllMocks();
	requests.clear();
	suspendedOrganizations.clear();
	acquiredRequests.length = 0;
	createRequestPersonnelWorkspaceContextMock.mockImplementation(
		(request: Pick<AdmittedOrganizationRequest, 'auth'>) => {
			const ctx = requests.get(request.auth.orgId);
			if (!ctx) throw new Error('Missing admitted workspace fixture');
			return {
				auth: request.auth,
				roster: ctx.roster,
				groups: ctx.groups,
				selfPins: ctx.selfPins,
				loadRankCatalog: ctx.loadRankCatalog,
				calendarCatalogs: ctx.calendarCatalogs,
				personnelAwardAcknowledgement: ctx.personnelAwardAcknowledgement,
				organizationSettings: ctx.organizationSettings
			};
		}
	);
});

describe('Personnel workspace page delivery', () => {
	it('returns a pending workspace while Calendar is loading, then exposes all facts for the admitted Organization', async () => {
		const ctx = seededContext();
		const calendar = deferred();
		const calendarStarted = deferred();
		const read = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = async (table, ...args) => {
			if (table === 'status_types') {
				calendarStarted.resolve();
				await calendar.promise;
			}
			return read(table, ...args);
		};
		let ready = false;

		const route = (await _createPersonnelLayoutLoad()(eventFor())) as PersonnelWorkspaceRouteData;
		void route.personnel.data.then(() => {
			ready = true;
		});
		await calendarStarted.promise;
		await Promise.resolve();
		expect(ready).toBe(false);
		calendar.resolve();
		const workspace = granted(await route.personnel.data);

		expect(workspace.data.personnel.map((person) => person.id)).toEqual(['able']);
		expect(workspace.data.groups.map((group) => group.name)).toEqual(['Alpha']);
		expect(workspace.data.statusTypes).toEqual([
			expect.objectContaining({ id: 'leave', name: 'Leave', color: '#ff0', textColor: '#000' })
		]);
		expect(workspace.data.lossWarningWindowDays).toBe(90);
		expect(workspace.hydration.orgId).toBe(ORG);
	});

	it('delivers the roster with loss warnings unavailable when Organization settings fail', async () => {
		const ctx = seededContext();
		const read = ctx.store.findOne.bind(ctx.store);
		ctx.store.findOne = async (table, ...args) => {
			if (table === 'organizations') throw new Error('Unavailable Organization settings');
			return read(table, ...args);
		};

		const route = (await _createPersonnelLayoutLoad()(eventFor())) as PersonnelWorkspaceRouteData;
		const workspace = granted(await route.personnel.data);

		expect(workspace.data.lossWarningWindowDays).toBeNull();
		expect(workspace.data.personnel.map((person) => person.id)).toEqual(['able']);
	});

	it('rejects deferred required-source failure through the HTTP boundary instead of returning an empty roster', async () => {
		const ctx = seededContext();
		const read = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = async (table, ...args) => {
			if (table === 'status_types') throw new Error('Private provider details');
			return read(table, ...args);
		};
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const route = (await _createPersonnelLayoutLoad()(eventFor())) as PersonnelWorkspaceRouteData;
			await expect(route.personnel.data).rejects.toMatchObject({
				status: 500,
				body: { message: 'Internal server error' }
			});
		} finally {
			log.mockRestore();
		}
	});

	it('streams Personnel denial as restricted even when Calendar is configured', async () => {
		const ctx = seededContext();
		requests.set(ORG, {
			...ctx,
			auth: { ...ctx.auth, capabilityMap: { ...createCapabilityMap('none'), calendar: 'configure' } }
		});
		const route = (await _createPersonnelLayoutLoad()(eventFor())) as PersonnelWorkspaceRouteData;
		await expect(route.personnel.data).resolves.toEqual({ laneKey: 'personnel', access: 'restricted' });
		expect(createRequestPersonnelWorkspaceContextMock).not.toHaveBeenCalled();
	});

	it('admits the Organization from the route segment and registers only its own dependencies', async () => {
		seededContext();
		const event = eventFor();
		const route = (await _createPersonnelLayoutLoad()(event)) as PersonnelWorkspaceRouteData;

		expect(granted(await route.personnel.data).hydration.orgId).toBe(ORG);
		expect(acquiredRequests).toEqual([ORG_SEGMENT]);
		expect(event.depends).toHaveBeenCalledWith('app:org-core', 'app:personnel-data');
	});

	it('fails a suspended Organization with 403 before streaming a workspace', async () => {
		seededContext();
		suspendedOrganizations.add(ORG);

		await expect(_createPersonnelLayoutLoad()(eventFor())).rejects.toMatchObject({
			status: 403,
			body: { message: 'Organization is suspended' }
		});
		expect(acquiredRequests).toEqual([]);
		expect(createRequestPersonnelWorkspaceContextMock).not.toHaveBeenCalled();
	});

	it('fails an unknown Organization with 404 before streaming a workspace', async () => {
		seededContext();

		await expect(_createPersonnelLayoutLoad()(eventFor('unknown-org'))).rejects.toMatchObject({
			status: 404,
			body: { message: 'Organization not found' }
		});
		expect(acquiredRequests).toEqual([]);
		expect(createRequestPersonnelWorkspaceContextMock).not.toHaveBeenCalled();
	});
});
