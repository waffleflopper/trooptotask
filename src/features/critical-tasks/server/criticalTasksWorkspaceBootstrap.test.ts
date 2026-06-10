import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { CriticalTasksWorkspaceData } from './criticalTasksWorkspaceBootstrap';

const { findManyMock, findOneMock, loadWithContextMock, mockCtx } = vi.hoisted(() => {
	const findManyMock = vi.fn();
	const findOneMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		findManyMock,
		findOneMock,
		loadWithContextMock,
		mockCtx: {
			auth: {
				userId: 'user-1',
				orgId: '11111111-1111-1111-1111-111111111111'
			},
			store: {
				findMany: findManyMock,
				findOne: findOneMock
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

import { streamCriticalTasksWorkspaceBootstrap } from './criticalTasksWorkspaceBootstrap';

describe('streamCriticalTasksWorkspaceBootstrap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findOneMock.mockResolvedValue({
			critical_tasks_default_expiration_months: 18,
			critical_tasks_expiring_soon_warning_days: 45
		});
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
	});

	it('streams a lane-keyed Critical Tasks workspace result with explicit hydration targets', async () => {
		const deferredRows = new Promise<Record<string, unknown>[]>(() => undefined);

		findManyMock.mockImplementation((table: string) => {
			switch (table) {
				case 'personnel':
				case 'groups':
				case 'ict_tasks':
				case 'personnel_ict_completions':
					return deferredRows;
				default:
					throw new Error(`Unexpected table ${table}`);
			}
		});

		const routeData = await streamCriticalTasksWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde'
		});
		let workspace: Awaited<typeof routeData.criticalTasks.data> | undefined;

		void routeData.criticalTasks.data.then((value) => {
			workspace = value;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'1-11-bde',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
				policyResource: { kind: 'unscoped' },
				defer: true
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
		expect(workspace).toBeDefined();
		expect(workspace?.laneKey).toBe('critical-tasks');
		expect(workspace?.data.settings).toEqual({
			defaultExpirationMonths: 18,
			expiringSoonWarningDays: 45
		});
		expect(workspace?.data.personnel).toBeInstanceOf(Promise);
		expect(workspace?.data.groups).toBeInstanceOf(Promise);
		expect(workspace?.data.ictTasks).toBeInstanceOf(Promise);
		expect(workspace?.data.personnelIctCompletions).toBeInstanceOf(Promise);
		expect(workspace?.hydration).toMatchObject({
			orgId: '11111111-1111-1111-1111-111111111111',
			ictTasks: expect.objectContaining({
				mode: 'replace',
				items: (workspace?.data as CriticalTasksWorkspaceData | undefined)?.ictTasks,
				deferred: true,
				snapshotKey: expect.any(String)
			}),
			personnelIctCompletions: expect.objectContaining({
				mode: 'replace',
				items: (workspace?.data as CriticalTasksWorkspaceData | undefined)?.personnelIctCompletions,
				deferred: true,
				snapshotKey: expect.any(String)
			})
		});
		expect(findManyMock).toHaveBeenCalledWith(
			'ict_tasks',
			'11111111-1111-1111-1111-111111111111',
			undefined,
			expect.objectContaining({
				isNull: { archived_at: true },
				orderBy: [
					{ column: 'sort_order', ascending: true },
					{ column: 'task_code', ascending: true }
				]
			})
		);
	});

	it('omits the archived-task filter when the library route requests archived definitions', async () => {
		const deferredRows = new Promise<Record<string, unknown>[]>(() => undefined);
		findManyMock.mockReturnValue(deferredRows);

		const routeData = await streamCriticalTasksWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde',
			includeArchivedTasks: true
		});
		void routeData.criticalTasks.data.catch(() => undefined);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(findManyMock).toHaveBeenCalledWith(
			'ict_tasks',
			'11111111-1111-1111-1111-111111111111',
			undefined,
			expect.not.objectContaining({
				isNull: expect.anything()
			})
		);
		expect(findManyMock).toHaveBeenCalledWith(
			'ict_tasks',
			'11111111-1111-1111-1111-111111111111',
			undefined,
			expect.objectContaining({
				orderBy: [
					{ column: 'sort_order', ascending: true },
					{ column: 'task_code', ascending: true }
				]
			})
		);
	});
});
