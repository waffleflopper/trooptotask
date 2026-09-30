// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Layout from './+layout.svelte';
import { criticalTasksWorkspaceStatus, resetCriticalTasksWorkspaceStatus } from '$features/critical-tasks';
import type { CriticalTasksWorkspaceResult } from '$features/critical-tasks/contracts';
import {
	criticalTasksWorkspaceHydrator,
	personnelIctCompletionsStore,
	type PersonnelIctCompletion
} from '$features/critical-tasks';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function createWorkspace(): CriticalTasksWorkspaceResult {
	return {
		laneKey: 'critical-tasks',
		data: {
			settings: {
				defaultExpirationMonths: 18,
				expiringSoonWarningDays: 45
			},
			personnel: [],
			groups: [],
			ictTasks: [],
			personnelIctCompletions: []
		},
		hydration: {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:empty', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:empty', items: [] },
			ictTasks: { mode: 'replace', snapshotKey: 'ict-tasks:empty', items: [] },
			personnelIctCompletions: { mode: 'replace', snapshotKey: 'completions:empty', items: [] }
		}
	};
}

describe('critical tasks layout client hydration', () => {
	afterEach(() => {
		cleanup();
		resetCriticalTasksWorkspaceStatus();
		criticalTasksWorkspaceHydrator.reset();
		personnelIctCompletionsStore.load([], 'test-reset');
		vi.unstubAllGlobals();
	});

	it.each(['response', 'body'] as const)(
		'stops an import during %s delivery before the next workspace resolves',
		async (stage) => {
			const children = createRawSnippet(() => ({ render: () => '<section>Critical Tasks child</section>' }));
			const { rerender } = render(Layout, {
				props: { children, data: { orgId: 'org-1', criticalTasks: { data: createWorkspace() } } }
			});
			await waitFor(() => expect(screen.getByText('Critical Tasks child')).toBeTruthy());
			const response = deferred<Response>();
			const body = deferred<unknown>();
			const json = vi.fn(() => body.promise);
			const fetchMock = vi.fn(() => (stage === 'response' ? response.promise : Promise.resolve({ ok: true, json })));
			vi.stubGlobal('fetch', fetchMock);
			const pendingImport = personnelIctCompletionsStore.importBatch({
				records: Array.from({ length: 501 }, (_, index) => ({
					rowNumber: index + 2,
					values: { firstName: 'Synthetic', lastName: 'Able', taskCode: 'TASK', completedAt: '2026-09-29' }
				}))
			});
			if (stage === 'body') await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
			const nextWorkspace = deferred<CriticalTasksWorkspaceResult>();
			await rerender({ children, data: { orgId: 'org-2', criticalTasks: { data: nextWorkspace.promise } } });
			expect(criticalTasksWorkspaceStatus.pending).toBe(true);
			const oldResult = {
				inserted: [
					{
						id: 'old-import-result',
						personnelId: 'old-person',
						ictTaskId: 'old-task',
						completedAt: '2026-09-29',
						validationMethod: 'Demonstration',
						validatedBy: null,
						notes: 'Old workspace',
						loggedBy: null,
						createdAt: '2026-09-29T12:00:00Z'
					}
				],
				updated: [],
				errors: []
			};
			response.resolve({ ok: true, json: async () => oldResult } as Response);
			body.resolve(oldResult);
			await expect(pendingImport).rejects.toThrow('Critical Tasks workspace changed during import');
			expect(personnelIctCompletionsStore.items).toEqual([]);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(criticalTasksWorkspaceStatus.pending).toBe(true);
		}
	);

	it('restores the unchanged workspace after invalidating a pending import', async () => {
		const workspace = createWorkspace();
		const savedCompletion: PersonnelIctCompletion = {
			id: 'saved-completion',
			personnelId: 'saved-person',
			ictTaskId: 'saved-task',
			completedAt: '2026-09-29',
			validationMethod: 'Demonstration',
			validatedBy: null,
			notes: 'Saved before import',
			loggedBy: null,
			createdAt: '2026-09-29T12:00:00Z'
		};
		workspace.data.personnelIctCompletions = [savedCompletion];
		workspace.hydration.personnelIctCompletions = {
			mode: 'replace',
			snapshotKey: 'completions:saved',
			items: [savedCompletion]
		};
		const children = createRawSnippet(() => ({ render: () => '<section>Critical Tasks child</section>' }));
		const { rerender } = render(Layout, {
			props: { children, data: { orgId: 'org-1', criticalTasks: { data: workspace } } }
		});
		await waitFor(() => expect(screen.getByText('Critical Tasks child')).toBeTruthy());
		const response = deferred<Response>();
		const fetchMock = vi.fn(() => response.promise);
		vi.stubGlobal('fetch', fetchMock);
		const pendingImport = personnelIctCompletionsStore.importBatch({
			records: Array.from({ length: 501 }, (_, index) => ({
				rowNumber: index + 2,
				values: { firstName: 'Synthetic', lastName: 'Able', taskCode: 'TASK', completedAt: '2026-09-29' }
			}))
		});
		const replacement = deferred<CriticalTasksWorkspaceResult>();
		await rerender({ children, data: { orgId: 'org-1', criticalTasks: { data: replacement.promise } } });
		expect(criticalTasksWorkspaceStatus.pending).toBe(true);
		replacement.resolve(workspace);
		await waitFor(() => expect(screen.getByText('Critical Tasks child')).toBeTruthy());
		expect(criticalTasksWorkspaceStatus.pending).toBe(false);
		expect(personnelIctCompletionsStore.loading).toBe(false);
		response.resolve({ ok: true, json: async () => ({ inserted: [], updated: [], errors: [] }) } as Response);
		await expect(pendingImport).rejects.toThrow('Critical Tasks workspace changed during import');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(personnelIctCompletionsStore.items).toEqual([savedCompletion]);
	});

	it('gates children until the top-level Critical Tasks workspace promise resolves', async () => {
		const workspace = createWorkspace();
		const streamedWorkspace = deferred<CriticalTasksWorkspaceResult>();
		const children = createRawSnippet(() => ({
			render: () => '<section data-testid="critical-tasks-child">Critical Tasks child</section>'
		}));

		render(Layout, {
			props: {
				children,
				data: {
					shell: {
						org: { id: 'org-1' }
					},
					criticalTasks: {
						data: streamedWorkspace.promise
					}
				}
			}
		});

		expect(screen.queryByTestId('critical-tasks-child')).toBeNull();
		expect(criticalTasksWorkspaceStatus.pending).toBe(true);
		expect(criticalTasksWorkspaceStatus.orgId).toBe('org-1');

		streamedWorkspace.resolve(workspace);

		await waitFor(() => expect(screen.getByTestId('critical-tasks-child')).toBeTruthy());
		expect(criticalTasksWorkspaceStatus.pending).toBe(false);
		expect(criticalTasksWorkspaceStatus.settings).toEqual(workspace.data.settings);
	});
});
