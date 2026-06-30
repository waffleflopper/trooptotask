import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { TrainingWorkspaceData } from './trainingWorkspaceBootstrap';
import type { Personnel } from '$lib/types';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { SignInRosterPersonnelLookupPort } from '$lib/server/core/ports';

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
			signInRosterPersonnelLookup: undefined as SignInRosterPersonnelLookupPort | undefined
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

import { streamTrainingWorkspaceBootstrap } from './trainingWorkspaceBootstrap';

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
		mockCtx.signInRosterPersonnelLookup = undefined;
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
	});

	it('streams a lane-keyed Training workspace result with explicit Training hydration targets', async () => {
		const deferredRows = new Promise<Record<string, unknown>[]>(() => undefined);

		findManyMock.mockImplementation((table: string) => {
			switch (table) {
				case 'personnel':
				case 'groups':
				case 'training_types':
				case 'training_views':
				case 'user_pinned_groups':
				case 'personnel_trainings':
				case 'organization_rank_catalog':
					return deferredRows;
				default:
					throw new Error(`Unexpected table ${table}`);
			}
		});

		const routeData = await streamTrainingWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde'
		});
		let workspace: Awaited<typeof routeData.training.data> | undefined;

		void routeData.training.data.then((value) => {
			workspace = value;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'1-11-bde',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.training.viewMatrix,
				policyResource: { kind: 'unscoped' },
				defer: true
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
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
		expect(findManyMock).toHaveBeenCalledWith(
			'training_types',
			'11111111-1111-1111-1111-111111111111',
			undefined,
			expect.objectContaining({
				orderBy: [{ column: 'sort_order', ascending: true }]
			})
		);
	});

	it('loads Training roster candidates through the sign-in roster lookup without Personnel lane access', async () => {
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
		mockCtx.signInRosterPersonnelLookup = {
			findPersonnelForRosterSnapshot: vi.fn(),
			listPersonnelForRosterCandidates: listRosterCandidatesMock
		};
		listRosterCandidatesMock.mockResolvedValue(personnel);
		findManyMock.mockResolvedValue([]);

		const routeData = await streamTrainingWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde'
		});
		const workspace = await routeData.training.data;

		await expect(workspace.data.personnel).resolves.toEqual(personnel);
		await expect(workspace.data.rankCatalog).resolves.toEqual([]);
		expect(listRosterCandidatesMock).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', {
			kind: 'groups',
			groupIds: ['group-alpha']
		});
		expect(findManyMock).not.toHaveBeenCalledWith('personnel', expect.anything(), expect.anything(), expect.anything());
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
			cookies: {} as Cookies,
			orgId: '1-11-bde'
		});
		const workspace = await routeData.training.data;

		await expect(workspace.data.rankCatalog).resolves.toEqual([
			expect.objectContaining({ code: 'DET-RET', state: 'retired' }),
			expect.objectContaining({ code: 'PO2', state: 'active' }),
			expect.objectContaining({ code: 'SSgt', state: 'active' })
		]);
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
