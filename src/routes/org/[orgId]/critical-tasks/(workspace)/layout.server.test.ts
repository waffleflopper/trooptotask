import { describe, expect, it, vi } from 'vitest';
import { createReadyAppShellRouteData, createUrlBlindLayoutEvent } from '../../appShell.test-support';

vi.mock('$features/critical-tasks/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/critical-tasks/index.server')>(
		'$features/critical-tasks/index.server'
	);
	return {
		...actual,
		fetchCriticalTasksBootstrap: async (_ctx: unknown, options: { includeArchivedTasks: boolean }) => ({
			personnel: [],
			groups: [],
			ictTasks: options.includeArchivedTasks ? [{ id: 'archived-task' }] : [{ id: 'active-task' }],
			personnelIctCompletions: []
		})
	};
});
import { load } from './+layout.server';

describe('Critical Tasks workspace layout', () => {
	it.each([
		{ capability: 'configure' as const, taskId: 'archived-task' },
		{ capability: 'view' as const, taskId: 'active-task' }
	])("delivers the $capability member's task selection without running ancestors", async ({ capability, taskId }) => {
		const { event } = createUrlBlindLayoutEvent<Parameters<typeof load>[0]>(
			createReadyAppShellRouteData({ orgId: 'org-1', role: 'member', criticalTasksCapability: capability })
		);
		const result = await load(event);
		const workspace = result && (await result.criticalTasks.data);
		expect(workspace).toMatchObject({
			laneKey: 'critical-tasks',
			data: { ictTasks: [{ id: taskId }] },
			hydration: { orgId: 'org-1' }
		});
	});
});
