import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { CriticalTasksWorkspaceData } from '$features/critical-tasks/contracts';
import type { GroupPersistence } from '$features/personnel/contracts';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { createInMemoryGroupPersistence } from '$features/personnel/inMemoryPersonnelPersistence.server';

const {
	listCatalogMock,
	findLatestCompletionsMock,
	findManyMock,
	findCriticalTasksDefaultsMock,
	listActiveForReadinessMock,
	loadWithContextMock,
	mockCtx
} = vi.hoisted(() => {
	const listCatalogMock = vi.fn();
	const findLatestCompletionsMock = vi.fn();
	const findManyMock = vi.fn();
	const findCriticalTasksDefaultsMock = vi.fn();
	const listActiveForReadinessMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		listCatalogMock,
		findLatestCompletionsMock,
		findManyMock,
		findCriticalTasksDefaultsMock,
		listActiveForReadinessMock,
		loadWithContextMock,
		mockCtx: {
			auth: {
				userId: 'user-1',
				orgId: '11111111-1111-1111-1111-111111111111'
			},
			organizationSettings: {
				findCriticalTasksDefaults: findCriticalTasksDefaultsMock
			},
			groups: undefined as unknown as Pick<GroupPersistence, 'listCatalog'>,
			criticalTaskLibrary: { listCatalog: listCatalogMock },
			criticalTasksReadModel: {
				findLatestCompletions: findLatestCompletionsMock
			},
			personnelCriticalTasksRoster: {
				listActiveForReadiness: listActiveForReadinessMock
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

import { streamCriticalTasksWorkspaceBootstrap } from './criticalTasksWorkspace.server';

function granted<T extends object>(workspace: T): Exclude<T, { access: 'restricted' }> {
	if ('access' in workspace) throw new Error('Expected a granted workspace');
	return workspace as Exclude<T, { access: 'restricted' }>;
}

describe('streamCriticalTasksWorkspaceBootstrap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const store = createInMemoryDataStore();
		store.findMany = findManyMock;
		mockCtx.groups = createInMemoryGroupPersistence(store, mockCtx.auth.orgId, { kind: 'organization' });
		findCriticalTasksDefaultsMock.mockResolvedValue({
			defaultExpirationMonths: 18,
			expiringSoonWarningDays: 45
		});
		findLatestCompletionsMock.mockResolvedValue([]);
		listCatalogMock.mockResolvedValue([]);
		listActiveForReadinessMock.mockResolvedValue([]);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
	});

	it('streams a lane-keyed Critical Tasks workspace result with explicit hydration targets', async () => {
		const deferredRows = new Promise<Record<string, unknown>[]>(() => undefined);
		listActiveForReadinessMock.mockReturnValue(deferredRows);
		listCatalogMock.mockReturnValue(deferredRows);

		findManyMock.mockImplementation((table: string) => {
			switch (table) {
				case 'groups':
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
		let workspace: ReturnType<typeof granted<Awaited<typeof routeData.criticalTasks.data>>> | undefined;

		void routeData.criticalTasks.data.then((value) => {
			workspace = granted(value);
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
			taskCode: 'A-001',
			title: 'Active Task',
			description: null,
			category: null,
			mos: [],
			expirationMonths: null,
			sortOrder: 0,
			archivedAt: null,
			createdAt: '2026-01-01T00:00:00.000Z'
		};
		const archivedTask = {
			...activeTask,
			id: 'task-archived',
			taskCode: 'A-002',
			title: 'Archived Task',
			archivedAt: '2026-02-01T00:00:00.000Z'
		};
		listCatalogMock.mockImplementation((options?: { includeArchived?: boolean }) =>
			Promise.resolve(options?.includeArchived ? [activeTask, archivedTask] : [activeTask])
		);
		findManyMock.mockResolvedValue([]);

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

		const defaultWorkspace = granted(await defaultRouteData.criticalTasks.data);
		const archivedWorkspace = granted(await archivedRouteData.criticalTasks.data);

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
