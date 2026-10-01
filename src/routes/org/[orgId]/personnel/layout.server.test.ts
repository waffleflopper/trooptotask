import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { createReadyAppShellRouteData, createSuspendedAppShellRouteData } from '$lib/test-support/appShellRouteData';
import type { PersonnelWorkspaceRouteData } from '$features/personnel/contracts';

const { requests, acquiredContexts } = vi.hoisted(() => ({
	requests: new Map<string, ReturnType<typeof createTestContext>>(),
	acquiredContexts: [] as string[]
}));

// Replace only request-context acquisition; real adapter policy/streaming and
// Personnel/Calendar operations execute against the admitted in-memory context.
vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: async (...args: Parameters<typeof actual.loadWithContext>) => {
			const [, , orgId, config] = args;
			acquiredContexts.push(orgId);
			const ctx = requests.get(orgId);
			if (!ctx) throw Object.assign(new Error('Organization not admitted'), { status: 403 });
			return config.defer
				? actual.loadWithDeferredContext(Promise.resolve(ctx), { ...config, defer: true })
				: actual.loadWithContextCore(ctx, config);
		}
	};
});

import { _createPersonnelLayoutLoad } from './+layout.server';

type PersonnelLoadEvent = Parameters<ReturnType<typeof _createPersonnelLayoutLoad>>[0];
const ORG = 'test-org';

function eventFor(suspended = false): PersonnelLoadEvent {
	return {
		locals: {} as App.Locals,
		cookies: {} as import('@sveltejs/kit').Cookies,
		url: new URL('https://example.test/org/public-org-name/personnel'),
		depends: vi.fn(),
		parent: async () =>
			suspended
				? createSuspendedAppShellRouteData({ orgId: ORG })
				: createReadyAppShellRouteData({ orgId: ORG, orgUrlSegment: 'public-org-name' })
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
	requests.clear();
	acquiredContexts.length = 0;
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
		const workspace = await route.personnel.data;

		expect(workspace.data.personnel.map((person) => person.id)).toEqual(['able']);
		expect(workspace.data.groups.map((group) => group.name)).toEqual(['Alpha']);
		expect(workspace.data.statusTypes).toEqual([
			expect.objectContaining({ id: 'leave', name: 'Leave', color: '#ff0', textColor: '#000' })
		]);
		expect(workspace.data.lossWarningWindowDays).toBe(90);
		expect(workspace.hydration.orgId).toBe(ORG);
	});

	it('preserves the optional settings fallback through page delivery', async () => {
		const ctx = seededContext();
		const read = ctx.store.findOne.bind(ctx.store);
		ctx.store.findOne = async (table, ...args) => {
			if (table === 'organizations') throw new Error('Unavailable Organization settings');
			return read(table, ...args);
		};

		const route = (await _createPersonnelLayoutLoad()(eventFor())) as PersonnelWorkspaceRouteData;
		const workspace = await route.personnel.data;

		expect(workspace.data.lossWarningWindowDays).toBe(180);
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

	it('rejects Personnel denial even when Calendar is configured', async () => {
		const ctx = seededContext();
		requests.set(ORG, {
			...ctx,
			auth: { ...ctx.auth, capabilityMap: { ...createCapabilityMap('none'), calendar: 'configure' } }
		});
		const route = (await _createPersonnelLayoutLoad()(eventFor())) as PersonnelWorkspaceRouteData;
		await expect(route.personnel.data).rejects.toMatchObject({ status: 403 });
	});

	it('does not start a workspace for a suspended Organization', async () => {
		seededContext();
		await expect(_createPersonnelLayoutLoad()(eventFor(true))).rejects.toMatchObject({ status: 403 });
		expect(acquiredContexts).toEqual([]);
	});
});
