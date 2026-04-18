import { describe, expect, it } from 'vitest';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { buildIctReportDashboard, buildIctReportSummary, filterIctReportPersonnel } from './ictReports';

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
					completedAt: '2025-03-25'
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
			windowDays: 60
		});
		expect(dashboard.kpis.tasksBelowThreshold).toEqual({
			count: 1,
			thresholdPercent: 70
		});
	});

	it('builds a MOS by task-category readiness matrix from persisted task categories', () => {
		const rifleReady: Personnel = {
			...infantry,
			id: 'person-rifle-ready',
			lastName: 'Able'
		};
		const rifleGap: Personnel = {
			...infantry,
			id: 'person-rifle-gap',
			lastName: 'Baker'
		};
		const weaponsTask: IctTask = {
			...commonTask,
			id: 'task-weapons',
			taskCode: '071-326-5703',
			title: 'Engage targets',
			category: 'Weapons',
			mos: ['11B'],
			sortOrder: 0
		};
		const medicalTask: IctTask = {
			...medicTask,
			id: 'task-medical',
			taskCode: '081-68W-1001',
			title: 'Treat hemorrhage',
			category: 'Medical',
			mos: ['68W'],
			sortOrder: 1
		};
		const uncategorizedTask: IctTask = {
			...commonTask,
			id: 'task-uncategorized',
			taskCode: '999-000-0001',
			title: 'Account for equipment',
			category: '   ',
			sortOrder: 2
		};

		const dashboard = buildIctReportDashboard({
			personnel: [rifleReady, rifleGap, medic],
			tasks: [weaponsTask, medicalTask, uncategorizedTask],
			completions: [
				completion({
					id: 'completion-rifle-weapons',
					personnelId: rifleReady.id,
					ictTaskId: weaponsTask.id,
					completedAt: '2026-03-01'
				}),
				completion({
					id: 'completion-medic-medical',
					personnelId: medic.id,
					ictTaskId: medicalTask.id,
					completedAt: '2026-03-01'
				}),
				completion({
					id: 'completion-medic-uncategorized',
					personnelId: medic.id,
					ictTaskId: uncategorizedTask.id,
					completedAt: '2026-03-01'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-04-15'
		});

		expect(dashboard.readinessMatrix.hasCategorizedTasks).toBe(true);
		expect(
			dashboard.readinessMatrix.categories.map(({ label, isUncategorized }) => ({ label, isUncategorized }))
		).toEqual([
			{ label: 'Weapons', isUncategorized: false },
			{ label: 'Medical', isUncategorized: false },
			{ label: 'Uncategorized', isUncategorized: true }
		]);
		expect(dashboard.readinessMatrix.rows).toEqual([
			{
				mos: '11B',
				personnelCount: 2,
				averageReadinessPercent: 25,
				averageReadyCount: 1,
				averageApplicableCount: 4,
				averageTier: 'danger',
				cells: [
					{
						categoryKey: expect.any(String),
						categoryLabel: 'Weapons',
						readinessPercent: 50,
						readyCount: 1,
						applicableCount: 2,
						tier: 'danger'
					},
					{
						categoryKey: expect.any(String),
						categoryLabel: 'Medical',
						readinessPercent: null,
						readyCount: 0,
						applicableCount: 0,
						tier: 'not-applicable'
					},
					{
						categoryKey: expect.any(String),
						categoryLabel: 'Uncategorized',
						readinessPercent: 0,
						readyCount: 0,
						applicableCount: 2,
						tier: 'danger'
					}
				]
			},
			{
				mos: '68W',
				personnelCount: 1,
				averageReadinessPercent: 100,
				averageReadyCount: 2,
				averageApplicableCount: 2,
				averageTier: 'good',
				cells: [
					{
						categoryKey: expect.any(String),
						categoryLabel: 'Weapons',
						readinessPercent: null,
						readyCount: 0,
						applicableCount: 0,
						tier: 'not-applicable'
					},
					{
						categoryKey: expect.any(String),
						categoryLabel: 'Medical',
						readinessPercent: 100,
						readyCount: 1,
						applicableCount: 1,
						tier: 'good'
					},
					{
						categoryKey: expect.any(String),
						categoryLabel: 'Uncategorized',
						readinessPercent: 100,
						readyCount: 1,
						applicableCount: 1,
						tier: 'good'
					}
				]
			}
		]);
	});

	it('exposes 12 monthly readiness snapshots for the filtered report population', () => {
		const dashboard = buildIctReportDashboard({
			personnel: [medic, infantry],
			tasks: [medicTask, commonTask],
			completions: [
				completion({ personnelId: medic.id, ictTaskId: medicTask.id, completedAt: '2026-01-15' }),
				completion({
					id: 'completion-medic-common',
					personnelId: medic.id,
					ictTaskId: commonTask.id,
					completedAt: '2026-02-01'
				}),
				completion({
					id: 'completion-infantry-common',
					personnelId: infantry.id,
					ictTaskId: commonTask.id,
					completedAt: '2026-03-01'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-04-15'
		});

		expect(dashboard.readinessTrend.months).toHaveLength(12);
		expect(dashboard.readinessTrend.months[0]).toMatchObject({
			month: '2025-05',
			overallReadinessPercent: 0,
			overallReadyCount: 0,
			overallApplicableCount: 3
		});
		expect(dashboard.readinessTrend.months.at(-1)).toMatchObject({
			month: '2026-04',
			overallReadinessPercent: 100,
			overallReadyCount: 3,
			overallApplicableCount: 3
		});
	});

	it('selects the top four MOS by filtered headcount for readiness trend comparisons', () => {
		const people: Personnel[] = [
			{ ...infantry, id: '11b-1', mos: '11B', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '11b-2', mos: '11B', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '11b-3', mos: '11B', groupId: 'group-bravo', groupName: 'Bravo' },
			{ ...medic, id: '68w-1', mos: '68W', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...medic, id: '68w-2', mos: '68W', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '25b-1', mos: '25B', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '25b-2', mos: '25B', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '12n-1', mos: '12N', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '88m-1', mos: '88M', groupId: 'group-alpha', groupName: 'Alpha' }
		];
		const filteredPersonnel = filterIctReportPersonnel(people, { groupId: 'group-alpha' });

		const dashboard = buildIctReportDashboard({
			personnel: filteredPersonnel,
			tasks: [commonTask],
			completions: [
				completion({
					id: 'completion-11b-1',
					personnelId: '11b-1',
					ictTaskId: commonTask.id,
					completedAt: '2026-03-01'
				}),
				completion({
					id: 'completion-68w-1',
					personnelId: '68w-1',
					ictTaskId: commonTask.id,
					completedAt: '2026-03-01'
				}),
				completion({
					id: 'completion-68w-2',
					personnelId: '68w-2',
					ictTaskId: commonTask.id,
					completedAt: '2026-03-01'
				}),
				completion({
					id: 'completion-25b-1',
					personnelId: '25b-1',
					ictTaskId: commonTask.id,
					completedAt: '2026-03-01'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-04-15'
		});

		expect(dashboard.readinessTrend.comparisonMos).toEqual(['11B', '25B', '68W', '12N']);
		expect(dashboard.readinessTrend.months.at(-1)?.mosReadiness).toEqual([
			{ mos: '11B', personnelCount: 2, readinessPercent: 50, readyCount: 1, applicableCount: 2 },
			{ mos: '25B', personnelCount: 2, readinessPercent: 50, readyCount: 1, applicableCount: 2 },
			{ mos: '68W', personnelCount: 2, readinessPercent: 100, readyCount: 2, applicableCount: 2 },
			{ mos: '12N', personnelCount: 1, readinessPercent: 0, readyCount: 0, applicableCount: 1 }
		]);
	});

	it('exposes fixed-bin individual readiness distributions by filtered MOS headcount', () => {
		const taskAlpha: IctTask = {
			...commonTask,
			id: 'task-alpha',
			taskCode: '081-000-0101',
			title: 'Stabilize casualty'
		};
		const taskBravo: IctTask = {
			...commonTask,
			id: 'task-bravo',
			taskCode: '081-000-0102',
			title: 'Move casualty'
		};
		const taskCharlie: IctTask = {
			...commonTask,
			id: 'task-charlie',
			taskCode: '081-000-0103',
			title: 'Report casualty'
		};
		const people: Personnel[] = [
			{ ...infantry, id: '11b-ready', lastName: 'Able', mos: '11B', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '11b-partial', lastName: 'Baker', mos: '11B', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '11b-gap', lastName: 'Charlie', mos: '11B', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...medic, id: '68w-ready', lastName: 'Delta', mos: '68W', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...medic, id: '68w-partial', lastName: 'Echo', mos: '68W', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '25u-partial', lastName: 'Foxtrot', mos: '25U', groupId: 'group-alpha', groupName: 'Alpha' },
			{ ...infantry, id: '12n-filtered-out', mos: '12N', groupId: 'group-bravo', groupName: 'Bravo' }
		];
		const filteredPersonnel = filterIctReportPersonnel(people, { groupId: 'group-alpha' });

		const dashboard = buildIctReportDashboard({
			personnel: filteredPersonnel,
			tasks: [taskAlpha, taskBravo, taskCharlie],
			completions: [
				completion({ id: '11b-ready-alpha', personnelId: '11b-ready', ictTaskId: taskAlpha.id }),
				completion({ id: '11b-ready-bravo', personnelId: '11b-ready', ictTaskId: taskBravo.id }),
				completion({ id: '11b-ready-charlie', personnelId: '11b-ready', ictTaskId: taskCharlie.id }),
				completion({ id: '11b-partial-alpha', personnelId: '11b-partial', ictTaskId: taskAlpha.id }),
				completion({ id: '11b-partial-bravo', personnelId: '11b-partial', ictTaskId: taskBravo.id }),
				completion({ id: '68w-ready-alpha', personnelId: '68w-ready', ictTaskId: taskAlpha.id }),
				completion({ id: '68w-ready-bravo', personnelId: '68w-ready', ictTaskId: taskBravo.id }),
				completion({ id: '68w-ready-charlie', personnelId: '68w-ready', ictTaskId: taskCharlie.id }),
				completion({ id: '68w-partial-alpha', personnelId: '68w-partial', ictTaskId: taskAlpha.id }),
				completion({ id: '25u-partial-alpha', personnelId: '25u-partial', ictTaskId: taskAlpha.id }),
				completion({ id: '25u-partial-bravo', personnelId: '25u-partial', ictTaskId: taskBravo.id })
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-04-15'
		});

		expect(dashboard.readinessDistribution.defaultMos).toBe('11B');
		expect(dashboard.readinessDistribution.bins).toEqual([
			{ key: '0-20', label: '0-20%', minPercent: 0, maxPercent: 20 },
			{ key: '20-40', label: '20-40%', minPercent: 20, maxPercent: 40 },
			{ key: '40-60', label: '40-60%', minPercent: 40, maxPercent: 60 },
			{ key: '60-80', label: '60-80%', minPercent: 60, maxPercent: 80 },
			{ key: '80-100', label: '80-100%', minPercent: 80, maxPercent: 100 }
		]);
		expect(
			dashboard.readinessDistribution.series.map(({ mos, personnelCount, bins }) => ({
				mos,
				personnelCount,
				counts: bins.map((bin) => bin.soldierCount)
			}))
		).toEqual([
			{ mos: '11B', personnelCount: 3, counts: [1, 0, 0, 1, 1] },
			{ mos: '68W', personnelCount: 2, counts: [0, 1, 0, 0, 1] },
			{ mos: '25U', personnelCount: 1, counts: [0, 0, 0, 1, 0] }
		]);
	});

	it('groups the next six months of latest completion expirations by MOS and projects month-6 readiness', () => {
		const longCommonTask: IctTask = {
			...commonTask,
			id: 'task-long-common',
			taskCode: '081-000-0009',
			title: 'Sustain equipment',
			expirationMonths: 12
		};

		const dashboard = buildIctReportDashboard({
			personnel: [medic, infantry],
			tasks: [{ ...commonTask, expirationMonths: null }, { ...medicTask, expirationMonths: 4 }, longCommonTask],
			completions: [
				completion({
					id: 'completion-medic-common',
					personnelId: medic.id,
					ictTaskId: commonTask.id,
					completedAt: '2026-02-20'
				}),
				completion({
					id: 'completion-medic-task',
					personnelId: medic.id,
					ictTaskId: medicTask.id,
					completedAt: '2026-02-01'
				}),
				completion({
					id: 'completion-medic-long',
					personnelId: medic.id,
					ictTaskId: longCommonTask.id,
					completedAt: '2026-01-01'
				}),
				completion({
					id: 'completion-infantry-common-old',
					personnelId: infantry.id,
					ictTaskId: commonTask.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-infantry-common-latest',
					personnelId: infantry.id,
					ictTaskId: commonTask.id,
					completedAt: '2026-04-01'
				})
			],
			settings: {
				defaultExpirationMonths: 3,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-04-15'
		});

		expect(dashboard.expirationCliff.mosSeries).toEqual(['68W', '11B']);
		expect(dashboard.expirationCliff.months).toEqual([
			{
				month: '2026-04',
				label: 'Apr 2026',
				totalExpiringCount: 0,
				mosSegments: [
					{ mos: '68W', expiringCount: 0 },
					{ mos: '11B', expiringCount: 0 }
				]
			},
			{
				month: '2026-05',
				label: 'May 2026',
				totalExpiringCount: 1,
				mosSegments: [
					{ mos: '68W', expiringCount: 1 },
					{ mos: '11B', expiringCount: 0 }
				]
			},
			{
				month: '2026-06',
				label: 'Jun 2026',
				totalExpiringCount: 1,
				mosSegments: [
					{ mos: '68W', expiringCount: 1 },
					{ mos: '11B', expiringCount: 0 }
				]
			},
			{
				month: '2026-07',
				label: 'Jul 2026',
				totalExpiringCount: 1,
				mosSegments: [
					{ mos: '68W', expiringCount: 0 },
					{ mos: '11B', expiringCount: 1 }
				]
			},
			{
				month: '2026-08',
				label: 'Aug 2026',
				totalExpiringCount: 0,
				mosSegments: [
					{ mos: '68W', expiringCount: 0 },
					{ mos: '11B', expiringCount: 0 }
				]
			},
			{
				month: '2026-09',
				label: 'Sep 2026',
				totalExpiringCount: 0,
				mosSegments: [
					{ mos: '68W', expiringCount: 0 },
					{ mos: '11B', expiringCount: 0 }
				]
			}
		]);
		expect(dashboard.expirationCliff.projectedReadinessAtMonth6).toEqual({
			month: '2026-09',
			label: 'Sep 2026',
			readinessPercent: 20,
			readyCount: 1,
			applicableCount: 5
		});
	});

	it('includes below-threshold task rows sorted worst-first for the shared dashboard payload', () => {
		const medicReady: Personnel = {
			...medic,
			id: 'person-medic-ready',
			lastName: 'Able'
		};
		const medicGap: Personnel = {
			...medic,
			id: 'person-medic-gap',
			lastName: 'Baker'
		};
		const infantryReady: Personnel = {
			...infantry,
			id: 'person-infantry-ready',
			lastName: 'Charlie'
		};
		const infantryGap: Personnel = {
			...infantry,
			id: 'person-infantry-gap',
			lastName: 'Delta'
		};
		const allHandsWorst: IctTask = {
			...commonTask,
			id: 'task-all-hands-worst',
			taskCode: '081-000-0001',
			title: 'React to contact'
		};
		const allHandsTieAlpha: IctTask = {
			...commonTask,
			id: 'task-all-hands-alpha',
			taskCode: '071-000-0002',
			title: 'Maintain communications'
		};
		const allHandsTieBravo: IctTask = {
			...commonTask,
			id: 'task-all-hands-bravo',
			taskCode: '081-000-0002',
			title: 'Move under direct fire'
		};
		const medicOnlyTie: IctTask = {
			...medicTask,
			id: 'task-medic-only-tie',
			taskCode: '081-68W-0003',
			title: 'Treat hemorrhage'
		};
		const allHandsReady: IctTask = {
			...commonTask,
			id: 'task-all-hands-ready',
			taskCode: '081-000-0004',
			title: 'Conduct PCC and PCI'
		};

		const dashboard = buildIctReportDashboard({
			personnel: [medicReady, medicGap, infantryReady, infantryGap],
			tasks: [allHandsWorst, allHandsTieBravo, allHandsTieAlpha, medicOnlyTie, allHandsReady],
			completions: [
				completion({
					id: 'completion-worst',
					personnelId: medicReady.id,
					ictTaskId: allHandsWorst.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-alpha-1',
					personnelId: medicReady.id,
					ictTaskId: allHandsTieAlpha.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-alpha-2',
					personnelId: infantryReady.id,
					ictTaskId: allHandsTieAlpha.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-bravo-1',
					personnelId: medicReady.id,
					ictTaskId: allHandsTieBravo.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-bravo-2',
					personnelId: infantryReady.id,
					ictTaskId: allHandsTieBravo.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-medic-only',
					personnelId: medicReady.id,
					ictTaskId: medicOnlyTie.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-ready-1',
					personnelId: medicReady.id,
					ictTaskId: allHandsReady.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-ready-2',
					personnelId: medicGap.id,
					ictTaskId: allHandsReady.id,
					completedAt: '2026-01-15'
				}),
				completion({
					id: 'completion-ready-3',
					personnelId: infantryReady.id,
					ictTaskId: allHandsReady.id,
					completedAt: '2026-01-15'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-02-15'
		});

		expect(dashboard.kpis.tasksBelowThreshold.count).toBe(4);
		expect(dashboard.tasksBelowThreshold).toEqual({
			thresholdPercent: 70,
			rows: [
				{
					taskId: 'task-all-hands-worst',
					taskCode: '081-000-0001',
					taskName: 'React to contact',
					percentComplete: 25,
					soldierGapCount: 3,
					applicableCount: 4,
					completeCount: 1
				},
				{
					taskId: 'task-all-hands-alpha',
					taskCode: '071-000-0002',
					taskName: 'Maintain communications',
					percentComplete: 50,
					soldierGapCount: 2,
					applicableCount: 4,
					completeCount: 2
				},
				{
					taskId: 'task-all-hands-bravo',
					taskCode: '081-000-0002',
					taskName: 'Move under direct fire',
					percentComplete: 50,
					soldierGapCount: 2,
					applicableCount: 4,
					completeCount: 2
				},
				{
					taskId: 'task-medic-only-tie',
					taskCode: '081-68W-0003',
					taskName: 'Treat hemorrhage',
					percentComplete: 50,
					soldierGapCount: 1,
					applicableCount: 2,
					completeCount: 1
				}
			]
		});
	});

	it('includes at-risk Soldier rows sorted worst-first for the shared dashboard payload', () => {
		const staleZero: Personnel = {
			...infantry,
			id: 'person-stale-zero',
			firstName: 'Ryan',
			lastName: 'Stale',
			groupId: 'group-alpha',
			groupName: 'Alpha'
		};
		const noUpdate: Personnel = {
			...infantry,
			id: 'person-no-update',
			firstName: 'Nora',
			lastName: 'NoUpdate',
			groupId: 'group-alpha',
			groupName: 'Alpha'
		};
		const staleTie: Personnel = {
			...medic,
			id: 'person-stale-tie',
			firstName: 'Sam',
			lastName: 'StaleTie'
		};
		const recentTie: Personnel = {
			...medic,
			id: 'person-recent-tie',
			firstName: 'Reese',
			lastName: 'RecentTie'
		};
		const lowerExpiringTie: Personnel = {
			...medic,
			id: 'person-lower-expiring',
			firstName: 'Lee',
			lastName: 'LowerExpiring'
		};
		const expiringTask: IctTask = {
			...commonTask,
			id: 'task-expiring',
			taskCode: '081-000-1001',
			title: 'Expiring task'
		};
		const currentTask: IctTask = {
			...commonTask,
			id: 'task-current',
			taskCode: '081-000-1002',
			title: 'Current task'
		};

		const dashboard = buildIctReportDashboard({
			personnel: [staleZero, noUpdate, staleTie, recentTie, lowerExpiringTie],
			tasks: [expiringTask, currentTask],
			completions: [
				completion({
					id: 'completion-stale-zero',
					personnelId: staleZero.id,
					ictTaskId: currentTask.id,
					completedAt: '2024-01-01',
					createdAt: '2024-02-01T00:00:00Z'
				}),
				completion({
					id: 'completion-stale-tie',
					personnelId: staleTie.id,
					ictTaskId: expiringTask.id,
					completedAt: '2025-04-20',
					createdAt: '2026-03-01T00:00:00Z'
				}),
				completion({
					id: 'completion-recent-tie',
					personnelId: recentTie.id,
					ictTaskId: expiringTask.id,
					completedAt: '2025-04-20',
					createdAt: '2026-03-20T00:00:00Z'
				}),
				completion({
					id: 'completion-lower-expiring',
					personnelId: lowerExpiringTie.id,
					ictTaskId: currentTask.id,
					completedAt: '2026-02-10',
					createdAt: '2026-02-10T00:00:00Z'
				})
			],
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			asOf: '2026-04-01'
		});

		expect(dashboard.atRiskSoldiers.rows).toEqual([
			{
				personnelId: 'person-stale-zero',
				soldierName: 'Stale, Ryan',
				mos: '11B',
				rank: 'SGT',
				groupName: 'Alpha',
				readinessPercent: 0,
				applicableCount: 2,
				readyCount: 0,
				tasksExpiringSoonCount: 0,
				daysSinceLastIctUpdate: 790,
				lastIctUpdateAt: '2024-02-01T00:00:00Z'
			},
			{
				personnelId: 'person-no-update',
				soldierName: 'NoUpdate, Nora',
				mos: '11B',
				rank: 'SGT',
				groupName: 'Alpha',
				readinessPercent: 0,
				applicableCount: 2,
				readyCount: 0,
				tasksExpiringSoonCount: 0,
				daysSinceLastIctUpdate: null,
				lastIctUpdateAt: null
			},
			{
				personnelId: 'person-stale-tie',
				soldierName: 'StaleTie, Sam',
				mos: '68W',
				rank: 'SGT',
				groupName: 'Alpha',
				readinessPercent: 50,
				applicableCount: 2,
				readyCount: 1,
				tasksExpiringSoonCount: 1,
				daysSinceLastIctUpdate: 31,
				lastIctUpdateAt: '2026-03-01T00:00:00Z'
			},
			{
				personnelId: 'person-recent-tie',
				soldierName: 'RecentTie, Reese',
				mos: '68W',
				rank: 'SGT',
				groupName: 'Alpha',
				readinessPercent: 50,
				applicableCount: 2,
				readyCount: 1,
				tasksExpiringSoonCount: 1,
				daysSinceLastIctUpdate: 12,
				lastIctUpdateAt: '2026-03-20T00:00:00Z'
			},
			{
				personnelId: 'person-lower-expiring',
				soldierName: 'LowerExpiring, Lee',
				mos: '68W',
				rank: 'SGT',
				groupName: 'Alpha',
				readinessPercent: 50,
				applicableCount: 2,
				readyCount: 1,
				tasksExpiringSoonCount: 0,
				daysSinceLastIctUpdate: 50,
				lastIctUpdateAt: '2026-02-10T00:00:00Z'
			}
		]);
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
