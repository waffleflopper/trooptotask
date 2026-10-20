import { afterEach, describe, expect, it } from 'vitest';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$features/personnel/contracts';
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
	const originalTimezone = process.env.TZ;
	afterEach(() => {
		if (originalTimezone === undefined) delete process.env.TZ;
		else process.env.TZ = originalTimezone;
	});

	function daysSinceUpdate(createdAt: string, asOf: string, timeZone?: string) {
		const snapshot = buildCriticalTasksReadinessSnapshot({
			personnel: [basePerson],
			activeTasks: [commonTask],
			completions: [completion({ completedAt: '2026-10-01', createdAt })],
			asOf,
			timeZone
		});
		return snapshot.atRiskSoldierRows[0].daysSinceLastIctUpdate;
	}

	it('reads the last update on the viewer day in the viewer time zone', () => {
		expect(daysSinceUpdate('2026-10-15T11:00:00Z', '2026-10-16', 'Pacific/Kiritimati')).toBe(0);
		expect(daysSinceUpdate('2026-10-15T11:00:00Z', '2026-10-15', 'UTC')).toBe(0);
	});

	it('reads the last update on the runtime local day when no time zone is given', () => {
		process.env.TZ = 'America/New_York';

		expect(daysSinceUpdate('2026-10-15T02:00:00Z', '2026-10-14')).toBe(0);
		expect(daysSinceUpdate('2026-10-15T02:00:00Z', '2026-10-15')).toBe(1);
	});

	it('keeps the last logged update separate from the latest completion date used for readiness', () => {
		const snapshot = buildCriticalTasksReadinessSnapshot({
			personnel: [basePerson],
			activeTasks: [commonTask],
			completions: [
				completion({ id: 'latest-completion-date', completedAt: '2026-03-10', createdAt: '2026-03-10T12:00:00Z' }),
				completion({ id: 'recent-backdated-log', completedAt: '2025-01-01', createdAt: '2026-04-14T12:00:00Z' })
			],
			asOf: '2026-04-15',
			timeZone: 'UTC'
		});

		expect(snapshot).toMatchObject({ readyCount: 1, applicableCount: 1, percent: 100 });
		expect(snapshot.atRiskSoldierRows[0]).toMatchObject({
			lastIctUpdateAt: '2026-04-14T12:00:00Z',
			daysSinceLastIctUpdate: 1
		});
	});

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
