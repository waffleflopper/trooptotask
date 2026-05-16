import { describe, expect, it } from 'vitest';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import {
	buildCriticalTasksReadinessSnapshot,
	isCriticalTaskCompletionReady
} from '$features/critical-tasks/utils/ictReadinessSnapshot';

const basePerson: Personnel = {
	id: 'person-1',
	rank: 'SGT',
	firstName: 'Jane',
	lastName: 'Smith',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null
};

const commonTask: IctTask = {
	id: 'task-common',
	taskCode: '081-833-0010',
	title: 'Open airway',
	description: null,
	category: 'Medical',
	mos: [],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-01-01T00:00:00Z'
};

function completion(overrides: Partial<PersonnelIctCompletion> = {}): PersonnelIctCompletion {
	return {
		id: 'completion-1',
		personnelId: 'person-1',
		ictTaskId: 'task-common',
		completedAt: '2025-08-15',
		validationMethod: 'Demonstration',
		validatedBy: null,
		notes: null,
		loggedBy: 'user-1',
		createdAt: '2025-08-15T12:00:00Z',
		...overrides
	};
}

describe('Critical Task readiness snapshot', () => {
	it('treats expiring-soon completions as ready behind one readiness helper', () => {
		expect(
			isCriticalTaskCompletionReady(
				'2025-08-15',
				commonTask,
				{ defaultExpirationMonths: 12, expiringSoonWarningDays: 60 },
				'2026-07-01'
			)
		).toBe(true);
	});

	it('builds a reusable readiness snapshot for filtered report personnel', () => {
		const snapshot = buildCriticalTasksReadinessSnapshot({
			personnel: [
				basePerson,
				{
					...basePerson,
					id: 'person-2',
					firstName: 'Alex',
					lastName: 'Jones',
					mos: '11B'
				}
			],
			activeTasks: [commonTask],
			completions: [completion()],
			settings: { defaultExpirationMonths: 12, expiringSoonWarningDays: 60 },
			asOf: '2026-07-01'
		});

		expect(snapshot).toMatchObject({
			percent: 50,
			readyCount: 1,
			applicableCount: 2,
			soldiersBelowThresholdCount: 1
		});
		expect(snapshot.tasksBelowThresholdRows).toEqual([
			{
				taskId: 'task-common',
				taskCode: '081-833-0010',
				taskName: 'Open airway',
				percentComplete: 50,
				soldierGapCount: 1,
				applicableCount: 2,
				completeCount: 1
			}
		]);
		expect(snapshot.atRiskSoldierRows.map((row) => [row.personnelId, row.readinessPercent])).toEqual([
			['person-2', 0],
			['person-1', 100]
		]);
	});
});
