// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Layout from './+layout.svelte';
import {
	criticalTasksWorkspaceStatus,
	resetCriticalTasksWorkspaceStatus
} from '$features/critical-tasks/criticalTasksWorkspaceHydration.svelte';
import type { CriticalTasksWorkspaceResult } from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';

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
					orgId: 'org-1',
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
