import { describe, expect, it } from 'vitest';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { buildIctReportDashboard, buildIctReportSummary } from './ictReports';

const medic: Personnel = {
	id: 'person-medic',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-alpha',
	groupName: 'Alpha',
	archivedAt: null
};

const infantry: Personnel = {
	...medic,
	id: 'person-infantry',
	lastName: 'Jones',
	firstName: 'Alex',
	mos: '11B',
	groupId: 'group-bravo',
	groupName: 'Bravo'
};

const medicTask: IctTask = {
	id: 'task-medic',
	taskCode: '181-105-1001',
	title: 'TCCC lane',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T00:00:00Z'
};

const commonTask: IctTask = {
	...medicTask,
	id: 'task-common',
	taskCode: '081-833-0010',
	title: 'Open airway',
	mos: []
};

function completion(overrides: Partial<PersonnelIctCompletion>): PersonnelIctCompletion {
	return {
		id: 'completion-1',
		personnelId: medic.id,
		ictTaskId: medicTask.id,
		completedAt: '2026-04-01',
		validationMethod: 'Demonstration',
		validatedBy: null,
		notes: null,
		loggedBy: 'user-1',
		createdAt: '2026-04-01T00:00:00Z',
		...overrides
	};
}

describe('ictReports', () => {
	it('builds action KPI metrics from readiness snapshots and expiration risk', () => {
		const infantryReady: Personnel = {
			...infantry,
			id: 'person-infantry-ready',
			lastName: 'Ready'
		};
		const infantryRisk: Personnel = {
			...infantry,
			id: 'person-infantry-risk',
			lastName: 'Risk'
		};

		const dashboard = buildIctReportDashboard({
			personnel: [medic, infantryReady, infantryRisk],
			tasks: [medicTask, commonTask],
			completions: [
				completion({ personnelId: medic.id, ictTaskId: medicTask.id, completedAt: '2026-01-15' }),
				completion({
					id: 'completion-old-common',
					personnelId: medic.id,
					ictTaskId: commonTask.id,
					completedAt: '2024-01-01'
				}),
				completion({
					id: 'completion-current-common',
					personnelId: medic.id,
					ictTaskId: commonTask.id,
					completedAt: '2026-02-10'
				}),
				completion({
					id: 'completion-expiring-common',
					personnelId: infantryReady.id,
					ictTaskId: commonTask.id,
					completedAt: '2025-03-01'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-02-15'
		});

		expect(dashboard.kpis.overallReadiness).toEqual({
			percent: 75,
			deltaPercent: 25,
			readyCount: 3,
			applicableCount: 4
		});
		expect(dashboard.kpis.soldiersBelow70).toEqual({
			count: 1,
			totalAssigned: 3,
			thresholdPercent: 70
		});
		expect(dashboard.kpis.tasksExpiringSoon).toEqual({
			count: 1,
			affectedSoldiers: 1,
			windowDays: 30
		});
		expect(dashboard.kpis.tasksBelowThreshold).toEqual({
			count: 1,
			thresholdPercent: 70
		});
	});

	it('computes readiness from applicable tasks only, counting current and expiring-soon tasks as ready', () => {
		const summary = buildIctReportSummary({
			personnel: [medic, infantry],
			tasks: [medicTask, commonTask],
			completions: [
				completion({ personnelId: medic.id, ictTaskId: medicTask.id, completedAt: '2026-01-15' }),
				completion({ id: 'completion-2', personnelId: medic.id, ictTaskId: commonTask.id, completedAt: '2025-12-20' }),
				completion({
					id: 'completion-3',
					personnelId: infantry.id,
					ictTaskId: commonTask.id,
					completedAt: '2024-01-01'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-01-31'
		});

		// Applicable cells:
		// medic: medicTask current, commonTask expiring-soon => 2 ready
		// infantry: commonTask expired => 0 ready
		// Total applicable = 3, ready = 2 => 67%
		expect(summary.overallReadinessPercent).toBe(67);
	});

	it('builds readiness by MOS and picks deterministic best and worst MOS groups', () => {
		const summary = buildIctReportSummary({
			personnel: [medic, infantry],
			tasks: [medicTask, commonTask],
			completions: [
				completion({ personnelId: medic.id, ictTaskId: medicTask.id, completedAt: '2026-01-15' }),
				completion({ id: 'completion-2', personnelId: medic.id, ictTaskId: commonTask.id, completedAt: '2025-12-20' }),
				completion({
					id: 'completion-3',
					personnelId: infantry.id,
					ictTaskId: commonTask.id,
					completedAt: '2024-01-01'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-01-31'
		});

		expect(summary.readinessByMos).toEqual([
			{ mos: '11B', readinessPercent: 0, applicableCount: 1, readyCount: 0 },
			{ mos: '68W', readinessPercent: 100, applicableCount: 2, readyCount: 2 }
		]);
		expect(summary.bestPerformingMos).toEqual({ mos: '68W', readinessPercent: 100, applicableCount: 2, readyCount: 2 });
		expect(summary.worstPerformingMos).toEqual({ mos: '11B', readinessPercent: 0, applicableCount: 1, readyCount: 0 });
	});

	it('builds a monthly completion trend from applicable completion history', () => {
		const summary = buildIctReportSummary({
			personnel: [medic, infantry],
			tasks: [medicTask, commonTask],
			completions: [
				completion({ personnelId: medic.id, ictTaskId: medicTask.id, completedAt: '2025-11-15' }),
				completion({ id: 'completion-2', personnelId: medic.id, ictTaskId: commonTask.id, completedAt: '2026-01-12' }),
				completion({
					id: 'completion-3',
					personnelId: infantry.id,
					ictTaskId: commonTask.id,
					completedAt: '2026-01-20'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-01-31'
		});

		expect(summary.completionTrend).toEqual([
			{ month: '2025-11', completions: 1 },
			{ month: '2026-01', completions: 2 }
		]);
	});
});
