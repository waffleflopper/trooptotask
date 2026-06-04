import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { TrainingWorkspaceData } from './trainingWorkspaceBootstrap';

const { findManyMock, loadWithContextMock, mockCtx } = vi.hoisted(() => {
	const findManyMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		findManyMock,
		loadWithContextMock,
		mockCtx: {
			auth: {
				userId: 'user-1',
				orgId: '11111111-1111-1111-1111-111111111111'
			},
			store: {
				findMany: findManyMock
			}
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
});
