import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { CriticalTasksBootstrap } from '$lib/server/core/orgShell';

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

vi.mock('./httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('./httpAdapter')>('./httpAdapter');
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

import { createSupabaseCriticalTasksWorkspacePort } from './supabaseOrgShell';

describe('createSupabaseCriticalTasksWorkspacePort', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
	});

	it('streams the Critical Tasks bootstrap before deferred workspace queries resolve', async () => {
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

		const port = createSupabaseCriticalTasksWorkspacePort({} as App.Locals, {} as Cookies, '1-11-bde');
		const streamed = await port.streamWorkspaceData<CriticalTasksBootstrap>('critical-tasks');
		let bootstrap: CriticalTasksBootstrap | undefined;

		void streamed.data.then((value) => {
			bootstrap = value;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'1-11-bde',
			expect.objectContaining({ permission: 'critical-tasks', defer: true })
		);
		expect(bootstrap).toBeDefined();
		expect(bootstrap?.personnel).toBeInstanceOf(Promise);
		expect(bootstrap?.groups).toBeInstanceOf(Promise);
		expect(bootstrap?.ictTasks).toBeInstanceOf(Promise);
		expect(bootstrap?.personnelIctCompletions).toBeInstanceOf(Promise);
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
});
