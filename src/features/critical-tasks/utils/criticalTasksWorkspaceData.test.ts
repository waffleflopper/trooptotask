import { afterEach, describe, expect, it } from 'vitest';
import {
	markCriticalTasksWorkspaceResolved,
	resetCriticalTasksWorkspaceStatus
} from '$features/critical-tasks/criticalTasksWorkspaceHydration.svelte';
import type { CriticalTasksWorkspaceResult } from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';
import { criticalTasksSettingsFromWorkspaceData } from './criticalTasksWorkspaceData';

function createWorkspace(orgId = 'org-1'): CriticalTasksWorkspaceResult {
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
			orgId,
			personnel: { mode: 'replace', snapshotKey: 'personnel:empty', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:empty', items: [] },
			ictTasks: { mode: 'replace', snapshotKey: 'ict-tasks:empty', items: [] },
			personnelIctCompletions: { mode: 'replace', snapshotKey: 'completions:empty', items: [] }
		}
	};
}

describe('criticalTasksSettingsFromWorkspaceData', () => {
	afterEach(() => {
		resetCriticalTasksWorkspaceStatus();
	});

	it('uses materialized streamed workspace settings for the matching org', () => {
		const workspace = createWorkspace('org-1');
		const data = {
			orgId: 'org-1',
			criticalTasks: {
				data: Promise.resolve(workspace)
			}
		};

		expect(criticalTasksSettingsFromWorkspaceData(data)).toBeUndefined();

		markCriticalTasksWorkspaceResolved(workspace);

		expect(criticalTasksSettingsFromWorkspaceData(data)).toEqual({
			defaultExpirationMonths: 18,
			expiringSoonWarningDays: 45
		});
	});

	it('does not use materialized streamed settings for a different org', () => {
		markCriticalTasksWorkspaceResolved(createWorkspace('org-1'));

		expect(
			criticalTasksSettingsFromWorkspaceData({
				orgId: 'org-2',
				criticalTasks: {
					data: Promise.resolve(createWorkspace('org-2'))
				}
			})
		).toBeUndefined();
	});
});
