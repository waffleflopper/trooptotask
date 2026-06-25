import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { CriticalTasksWorkspaceData } from './criticalTasksWorkspaceBootstrap';

const { findLatestCompletionsMock, findManyMock, findOneMock, loadWithContextMock, mockCtx } = vi.hoisted(() => {
	const findLatestCompletionsMock = vi.fn();
	const findManyMock = vi.fn();
	const findOneMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		findLatestCompletionsMock,
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
			},
			criticalTasksReadModel: {
				findLatestCompletions: findLatestCompletionsMock
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
		findLatestCompletionsMock.mockResolvedValue([]);
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
	});

	it('hydrates active task definitions by default and archived definitions when requested', async () => {
		const activeTask = {
			id: 'task-active',
			organization_id: '11111111-1111-1111-1111-111111111111',
			task_code: 'A-001',
			title: 'Active Task',
			description: null,
			category: null,
			mos: [],
			expiration_months: null,
			sort_order: 0,
			archived_at: null,
			created_at: '2026-01-01T00:00:00.000Z'
		};
		const archivedTask = {
			...activeTask,
			id: 'task-archived',
			task_code: 'A-002',
			title: 'Archived Task',
			archived_at: '2026-02-01T00:00:00.000Z'
		};
		findManyMock.mockImplementation(
			(table: string, _orgId: string, _filters: unknown, options?: Record<string, unknown>) => {
				if (table === 'ict_tasks') {
					return Promise.resolve(options?.isNull ? [activeTask] : [activeTask, archivedTask]);
				}
				return Promise.resolve([]);
			}
		);

		const defaultRouteData = await streamCriticalTasksWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde'
		});
		const archivedRouteData = await streamCriticalTasksWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde',
			includeArchivedTasks: true
		});

		const defaultWorkspace = await defaultRouteData.criticalTasks.data;
		const archivedWorkspace = await archivedRouteData.criticalTasks.data;

		await expect(defaultWorkspace.data.ictTasks).resolves.toEqual([
			expect.objectContaining({ id: 'task-active', archivedAt: null })
		]);
		await expect(archivedWorkspace.data.ictTasks).resolves.toEqual([
			expect.objectContaining({ id: 'task-active', archivedAt: null }),
			expect.objectContaining({ id: 'task-archived', archivedAt: '2026-02-01T00:00:00.000Z' })
		]);
		expect(archivedWorkspace.hydration.ictTasks.items).toBe(archivedWorkspace.data.ictTasks);
	});
});
