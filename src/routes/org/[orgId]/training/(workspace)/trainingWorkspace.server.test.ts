import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import {
	createInMemoryTrainingCatalogPersistence,
	createInMemoryTrainingCompletionPersistence
} from '$features/training/server/inMemoryTrainingPersistence.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { TrainingWorkspaceData } from '$features/training/contracts';
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { GroupPersistence, Personnel, SelfPinPersistence } from '$features/personnel/contracts';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { PersonnelTrainingRosterPort } from '$features/personnel/index.server';
import {
	createInMemoryDataStore,
	createQueryWithRawStorePortsContext
} from '$features/training/server/trainingPersistence.test-support.server';
import { createTestRankCatalogPersistence } from '$lib/server/adapters/inMemory';
import {
	createInMemoryGroupPersistence,
	createInMemorySelfPinPersistence
} from '$features/personnel/inMemoryPersonnelPersistence.server';

const { findManyMock, listRosterCandidatesMock, loadWithContextMock, mockCtx } = vi.hoisted(() => {
	const findManyMock = vi.fn();
	const listRosterCandidatesMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		findManyMock,
		listRosterCandidatesMock,
		loadWithContextMock,
		mockCtx: {
			auth: {
				userId: 'user-1',
				orgId: '11111111-1111-1111-1111-111111111111',
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' } as ScopeSet
			},
			store: {
				findMany: findManyMock
			},
			rankCatalog: undefined as unknown as ReturnType<typeof createTestRankCatalogPersistence>,
			loadRankCatalog: undefined as unknown as () => Promise<
				import('$features/personnel/contracts').RankCatalogEntry[]
			>,
			trainingCatalog: undefined as unknown as ReturnType<typeof createInMemoryTrainingCatalogPersistence>,
			trainingCompletions: undefined as unknown as ReturnType<typeof createInMemoryTrainingCompletionPersistence>,
			groups: undefined as unknown as Pick<GroupPersistence, 'listCatalog'>,
			selfPins: undefined as unknown as Pick<SelfPinPersistence, 'listNames'>,
			personnelTrainingRoster: undefined as unknown as PersonnelTrainingRosterPort,
			organizationSettings: undefined as unknown as OrganizationSettingsReader
		}
	};
});

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

import { streamTrainingWorkspaceBootstrap } from './trainingWorkspace.server';

function granted<T extends object>(workspace: T): Exclude<T, { access: 'restricted' }> {
	if ('access' in workspace) throw new Error('Expected a granted workspace');
	return workspace as Exclude<T, { access: 'restricted' }>;
}

describe('streamTrainingWorkspaceBootstrap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCtx.auth.capabilityMap = {
			calendar: 'view',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'view',
			onboarding: 'view',
			ratingScheme: 'view'
		};
		mockCtx.auth.scopeSet = { kind: 'organization' };
		const store = createInMemoryDataStore();
		store.findMany = findManyMock;
		mockCtx.rankCatalog = createTestRankCatalogPersistence(store, mockCtx.auth.orgId);
		mockCtx.loadRankCatalog = () => loadOrganizationRankCatalog(mockCtx as never, { authorization: 'training-view' });
		mockCtx.trainingCatalog = createInMemoryTrainingCatalogPersistence(store, mockCtx.auth.orgId);
		mockCtx.trainingCompletions = createInMemoryTrainingCompletionPersistence(store, mockCtx.auth.orgId);
		mockCtx.groups = createInMemoryGroupPersistence(store, mockCtx.auth.orgId, mockCtx.auth.scopeSet);
		mockCtx.selfPins = createInMemorySelfPinPersistence(store, mockCtx.auth.orgId, mockCtx.auth.userId);
		mockCtx.personnelTrainingRoster = {
			listActiveForWorkspace: listRosterCandidatesMock,
			listActiveForReports: vi.fn(),
			findWriteSubjects: vi.fn()
		};
		const settings = createQueryWithRawStorePortsContext();
		settings.rawStore.seed('organizations', [
			{ id: mockCtx.auth.orgId, name: 'Test Company', training_readiness_goal_percent: 85 }
		]);
		mockCtx.organizationSettings = settings.organizationSettings;
		listRosterCandidatesMock.mockResolvedValue([]);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
	});

	it('streams a lane-keyed Training workspace result with explicit Training hydration targets', async () => {
		const deferredRows = new Promise<Record<string, unknown>[]>(() => undefined);

		findManyMock.mockReturnValue(deferredRows);

		const routeData = await streamTrainingWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { get: () => undefined } as unknown as Cookies,
			orgId: '1-11-bde'
		});
		let workspace: ReturnType<typeof granted<Awaited<typeof routeData.training.data>>> | undefined;

		void routeData.training.data.then((value) => {
			workspace = granted(value);
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(workspace).toBeDefined();
		expect(workspace?.laneKey).toBe('training');
		expect(workspace?.data.personnel).toBeInstanceOf(Promise);
		expect(workspace?.data.groups).toBeInstanceOf(Promise);
		expect(workspace?.data.trainingTypes).toBeInstanceOf(Promise);
		expect(workspace?.data.trainingViews).toBeInstanceOf(Promise);
		expect(workspace?.data.pinnedGroups).toBeInstanceOf(Promise);
		expect(workspace?.data.personnelTrainings).toBeInstanceOf(Promise);
		expect(workspace?.data.rankCatalog).toBeInstanceOf(Promise);
		expect(workspace?.hydration).toMatchObject({
			orgId: '11111111-1111-1111-1111-111111111111',
			trainingTypes: expect.objectContaining({
				mode: 'replace',
				items: (workspace?.data as TrainingWorkspaceData | undefined)?.trainingTypes,
				deferred: true,
				snapshotKey: expect.any(String)
			}),
			personnelTrainings: expect.objectContaining({
				mode: 'replace',
				items: (workspace?.data as TrainingWorkspaceData | undefined)?.personnelTrainings,
				deferred: true,
				snapshotKey: expect.any(String)
			}),
			rankCatalog: expect.objectContaining({
				mode: 'replace',
				items: (workspace?.data as TrainingWorkspaceData | undefined)?.rankCatalog,
				deferred: true,
				snapshotKey: expect.any(String)
			})
		});
	});

	it('loads Training roster candidates through the Personnel-owned Training port without Personnel lane access', async () => {
		const personnel = [
			{
				id: 'p-alpha',
				slug: 'alpha-jane',
				rank: 'SGT',
				lastName: 'Alpha',
				firstName: 'Jane',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'group-alpha',
				groupName: 'Alpha',
				archivedAt: null
			}
		] satisfies Personnel[];
		mockCtx.auth.capabilityMap = {
			calendar: 'view',
			personnel: 'none',
			training: 'operate',
			criticalTasks: 'view',
			onboarding: 'view',
			ratingScheme: 'view'
		};
		mockCtx.auth.scopeSet = { kind: 'groups', groupIds: ['group-alpha'] };
		listRosterCandidatesMock.mockResolvedValue(personnel);
		const savedGroups = [
			{ id: 'group-alpha', name: 'Alpha', sort_order: 0 },
			{ id: 'group-bravo', name: 'Bravo', sort_order: 1 }
		];
		findManyMock.mockImplementation(
			(table: string, _orgId: string, _filters: unknown, options?: { inFilters?: { id?: string[] } }) =>
				table === 'personnel'
					? Promise.reject(new Error('Personnel SELECT denied for this Training-only actor'))
					: Promise.resolve(
							table === 'groups'
								? savedGroups.filter((row) => !options?.inFilters?.id || options.inFilters.id.includes(row.id))
								: []
						)
		);
		const scopedStore = createInMemoryDataStore();
		scopedStore.findMany = findManyMock;
		mockCtx.groups = createInMemoryGroupPersistence(scopedStore, mockCtx.auth.orgId, mockCtx.auth.scopeSet);

		const routeData = await streamTrainingWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { get: () => undefined } as unknown as Cookies,
			orgId: '1-11-bde'
		});
		const workspace = granted(await routeData.training.data);

		await expect(workspace.data.personnel).resolves.toEqual(personnel);
		await expect(workspace.data.groups).resolves.toEqual([
			expect.objectContaining({ id: 'group-alpha', name: 'Alpha' })
		]);
		expect(listRosterCandidatesMock).toHaveBeenCalledWith(mockCtx.auth);
		await expect(workspace.data.rankCatalog).resolves.toEqual([]);
	});

	it('streams Organization rank catalog entries for Training applicability controls', async () => {
		findManyMock.mockImplementation((table: string) => {
			if (table === 'organization_rank_catalog') {
				return Promise.resolve([
					rankCatalogRow({ code: 'DET-RET', state: 'retired', pay_grade: 'E-5' }),
					rankCatalogRow({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy', pay_grade: 'E-5' }),
					rankCatalogRow({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force', pay_grade: 'E-5' })
				]);
			}
			return Promise.resolve([]);
		});

		const routeData = await streamTrainingWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { get: () => undefined } as unknown as Cookies,
			orgId: '1-11-bde'
		});
		const workspace = granted(await routeData.training.data);

		await expect(workspace.data.rankCatalog).resolves.toEqual([
			expect.objectContaining({ code: 'DET-RET', state: 'retired' }),
			expect.objectContaining({ code: 'PO2', state: 'active' }),
			expect.objectContaining({ code: 'SSgt', state: 'active' })
		]);
	});

	it('streams the stored Organization goal and the same calendar day used by reports', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-15T00:30:00Z'));
		findManyMock.mockResolvedValue([]);
		try {
			for (const [timeZone, readinessAsOf] of [
				['America/Anchorage', '2026-10-14'],
				[undefined, '2026-10-15']
			]) {
				const routeData = await streamTrainingWorkspaceBootstrap({
					locals: {} as App.Locals,
					cookies: { get: (name: string) => (name === 't2t_tz' ? timeZone : undefined) } as unknown as Cookies,
					orgId: '1-11-bde'
				});
				const workspace = granted(await routeData.training.data);
				await expect(workspace.data.readiness).resolves.toEqual({ readinessGoalPercent: 85, readinessAsOf });
				await expect(workspace.hydration.readiness?.items).resolves.toEqual({
					readinessGoalPercent: 85,
					readinessAsOf
				});
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('streams the day without a goal, and the rest of the workspace, when the Organization goal cannot be read', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		findManyMock.mockResolvedValue([]);
		mockCtx.organizationSettings = {
			findTrainingBriefingContext: vi.fn().mockRejectedValue(new Error('settings unavailable'))
		};

		const routeData = await streamTrainingWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { get: () => undefined } as unknown as Cookies,
			orgId: '1-11-bde'
		});
		const workspace = granted(await routeData.training.data);

		await expect(workspace.hydration.readiness?.items).resolves.toEqual({
			readinessGoalPercent: null,
			readinessAsOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
		});
		await expect(workspace.data.personnelTrainings).resolves.toEqual([]);
	});
});

function rankCatalogRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: overrides.id ?? `rank-${overrides.code ?? 'SGT'}`,
		organization_id: '11111111-1111-1111-1111-111111111111',
		code: overrides.code ?? 'SGT',
		label: overrides.label ?? overrides.code ?? 'Sergeant',
		service: overrides.service ?? 'army',
		category: overrides.category ?? 'enlisted',
		pay_grade: overrides.pay_grade ?? 'E-5',
		state: overrides.state ?? 'active',
		source: overrides.source ?? 'custom',
		sort_order: overrides.sort_order ?? 0,
		...overrides
	};
}
