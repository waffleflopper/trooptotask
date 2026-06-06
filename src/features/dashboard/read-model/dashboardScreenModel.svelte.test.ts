import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, DailyAssignment } from '$lib/types';
import { createDashboardScreenModel, type DashboardStoragePort } from './dashboardScreenModel.svelte';
import type { DashboardWorkspaceResult } from '../server/dashboardWorkspaceBootstrap';
import type { DashboardPageData } from '../dashboard.types';

function createMemoryStorage(initial: Record<string, string> = {}): DashboardStoragePort & {
	values: Record<string, string>;
} {
	return {
		values: { ...initial },
		getItem(key: string) {
			return this.values[key] ?? null;
		},
		setItem(key: string, value: string) {
			this.values[key] = value;
		}
	};
}

function makeData(
	overrides: Partial<DashboardPageData> = {},
	workspaceOverrides: Record<string, unknown> = {}
): DashboardPageData {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		dashboard: {
			workspaceKey: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				pinnedGroups: [],
				activeOnboardings: [],
				ratingSchemeEntries: [],
				todayDutyEvents: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: [],
				lossWarningWindowDays: 180,
				awardTrackingAcknowledgedPersonnelIds: [],
				...workspaceOverrides
			},
			hydration: { orgId: 'org-1' } as DashboardWorkspaceResult['hydration']
		},
		trainingSummary: null,
		ictlSummary: null,
		onboardingTrainingCompletions: [],
		...overrides
	};
}

function makeSources(
	input: {
		personnel?: Partial<Personnel>[];
		statusTypes?: Partial<StatusType>[];
		availabilityEntries?: Partial<AvailabilityEntry>[];
		groups?: Partial<Group>[];
		assignmentTypes?: Partial<AssignmentType>[];
		dailyAssignments?: Partial<DailyAssignment>[];
		pinnedGroups?: string[];
		loading?: Partial<Record<'personnel' | 'statusTypes' | 'availability' | 'dailyAssignments' | 'groups', boolean>>;
	} = {}
) {
	return {
		personnel: {
			items: (input.personnel ?? []) as Personnel[],
			loading: input.loading?.personnel ?? false
		},
		statusTypes: {
			items: (input.statusTypes ?? []) as StatusType[],
			loading: input.loading?.statusTypes ?? false
		},
		availability: {
			items: (input.availabilityEntries ?? []) as AvailabilityEntry[],
			loading: input.loading?.availability ?? false
		},
		dailyAssignments: {
			assignments: (input.dailyAssignments ?? []) as DailyAssignment[],
			types: (input.assignmentTypes ?? []) as AssignmentType[],
			loading: input.loading?.dailyAssignments ?? false
		},
		groups: {
			items: (input.groups ?? []) as Group[],
			loading: input.loading?.groups ?? false
		},
		pinnedGroups: {
			list: input.pinnedGroups ?? []
		}
	};
}

describe('createDashboardScreenModel', () => {
	it('keeps getting started dismissed after a successful dismissal request', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await model.dismissGettingStarted();

		expect(model.gettingStartedDismissed).toBe(true);
		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/getting-started', { method: 'POST' });
		vi.unstubAllGlobals();
	});

	it('rolls back getting started dismissal when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await model.dismissGettingStarted();

		expect(model.gettingStartedDismissed).toBe(false);
		vi.unstubAllGlobals();
	});

	it('rolls back getting started dismissal when the request rejects', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await expect(model.dismissGettingStarted()).resolves.toBeUndefined();

		expect(model.gettingStartedDismissed).toBe(false);
		vi.unstubAllGlobals();
	});

	it('pre-shapes out-today rows by status and group while preserving the saved grouping mode', () => {
		const storage = createMemoryStorage({ 'dashboard-out-today-group-by': 'group' });
		const model = createDashboardScreenModel(makeData(), {
			today: '2026-04-23',
			storage,
			sources: makeSources({
				personnel: [
					{ id: 'p1', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', groupId: 'g1' },
					{ id: 'p2', rank: 'SPC', firstName: 'Bo', lastName: 'Jones', groupId: null }
				],
				groups: [{ id: 'g1', name: 'Alpha', sortOrder: 1 }],
				statusTypes: [
					{ id: 'st1', name: 'Leave', color: '#aa0000', textColor: '#ffffff' },
					{ id: 'st2', name: 'TDY', color: '#0000aa', textColor: '#ffffff' }
				],
				availabilityEntries: [
					{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-04-23', endDate: '2026-04-23' },
					{ id: 'a2', personnelId: 'p2', statusTypeId: 'st2', startDate: '2026-04-22', endDate: '2026-04-24' }
				]
			})
		});

		expect(model.peopleDuty.outToday.mode).toBe('group');
		expect(model.peopleDuty.outToday.byStatus.map(([label]) => label)).toEqual(['Leave', 'TDY']);
		expect(model.peopleDuty.outToday.byGroup.map(([label]) => label)).toEqual(['Alpha', 'Unassigned']);
		expect(model.peopleDuty.outToday.byGroup[0][1][0].personName).toBe('SGT Smith, Ann');

		model.peopleDuty.outToday.setMode('status');

		expect(model.peopleDuty.outToday.mode).toBe('status');
		expect(storage.values['dashboard-out-today-group-by']).toBe('status');
	});

	it('pre-shapes upcoming changes and shares the persisted grouping mode across dashboard tabs', () => {
		const storage = createMemoryStorage({ 'dashboard-upcoming-group-by': 'group' });
		const model = createDashboardScreenModel(makeData(), {
			today: '2026-04-23',
			storage,
			sources: makeSources({
				personnel: [
					{ id: 'p1', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', groupId: 'g1' },
					{ id: 'p2', rank: 'SPC', firstName: 'Bo', lastName: 'Jones', groupId: null }
				],
				groups: [{ id: 'g1', name: 'Alpha', sortOrder: 1 }],
				statusTypes: [{ id: 'st1', name: 'Leave', color: '#aa0000', textColor: '#ffffff' }],
				availabilityEntries: [
					{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-04-25', endDate: '2026-04-27' },
					{ id: 'a2', personnelId: 'p2', statusTypeId: 'st1', startDate: '2026-04-26', endDate: '2026-04-28' }
				]
			})
		});

		expect(model.unitReadiness.upcomingChanges.mode).toBe('group');
		expect(model.peopleDuty.upcomingChanges.mode).toBe('group');
		expect(model.unitReadiness.upcomingChanges.byGroup.map(([label]) => label)).toEqual(['Alpha', 'Unassigned']);

		model.unitReadiness.upcomingChanges.setMode('date');

		expect(model.peopleDuty.upcomingChanges.mode).toBe('date');
		expect(storage.values['dashboard-upcoming-group-by']).toBe('date');
		expect(model.upcomingChanges.map((change) => change.date)).toEqual([
			'2026-04-25',
			'2026-04-26',
			'2026-04-27',
			'2026-04-28'
		]);
	});

	it('defaults today through the shared date formatter when no explicit date is supplied', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-23T12:00:00'));

		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		expect(model.today).toBe('2026-04-23');

		vi.useRealTimers();
	});

	it('pre-shapes training and evaluation rows for the training tab', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));

		const model = createDashboardScreenModel(
			makeData(
				{
					trainingSummary: {
						stats: {
							current: 3,
							expired: 1,
							warningOrange: 2,
							warningYellow: 0,
							notCompleted: 0,
							notRequired: 0,
							total: 6
						},
						issues: [
							{ personName: 'SGT Smith', typeName: 'CPR', status: 'warning-orange', label: 'Due 20d' },
							{ personName: 'SGT Smith', typeName: 'BLS', status: 'expired', label: 'Expired 5d' },
							{ personName: 'SPC Jones', typeName: 'Range', status: 'warning-orange', label: 'Due 10d' }
						]
					}
				},
				{
					ratingSchemeEntries: [
						{ id: 'r1', ratedPersonId: 'p1', ratingPeriodEnd: '2026-05-15', status: 'active', evalType: 'NCOER' }
					]
				}
			),
			{
				today: '2026-04-23',
				sources: makeSources({
					personnel: [
						{ id: 'p1', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', groupId: 'g1' },
						{ id: 'p2', rank: 'SPC', firstName: 'Bo', lastName: 'Jones', groupId: 'g1' }
					],
					groups: [{ id: 'g1', name: 'Alpha', sortOrder: 1 }]
				})
			}
		);

		expect(model.trainingEvals.hasTrainingIssues).toBe(true);
		expect(model.trainingEvals.trainingColor).toBe('var(--destructive)');
		expect(model.trainingEvals.groupedIndividuals[0]).toMatchObject({
			personName: 'SGT Smith',
			typeNames: 'BLS, CPR',
			isExpired: true
		});
		expect(model.trainingEvals.evalsDueSoon[0]).toMatchObject({
			id: 'r1',
			personName: 'SGT Smith',
			evalType: 'NCOER'
		});

		vi.useRealTimers();
	});

	it('pre-shapes a compact ICTL summary for the training tab when dashboard data is present', () => {
		const model = createDashboardScreenModel(
			makeData({
				ictlSummary: {
					hasActiveTasks: true,
					overallReadinessPercent: 68,
					overallDeltaPercent: -4,
					readyCount: 17,
					applicableCount: 25,
					soldiersBelowThresholdCount: 3,
					soldiersBelowThresholdTotal: 8,
					thresholdPercent: 70,
					expiringSoonCount: 5,
					expiringSoonAffectedSoldiers: 4,
					expiringSoonWindowDays: 60,
					tasksBelowThresholdCount: 2,
					projectedReadinessPercent: 64,
					mosReadiness: [
						{ mos: '11B', personnelCount: 5, readinessPercent: 60 },
						{ mos: '68W', personnelCount: 3, readinessPercent: 92 }
					],
					trend: [{ month: '2026-04', label: 'Apr', readinessPercent: 68 }],
					tasksBelowThreshold: [
						{
							taskId: 'task-1',
							taskCode: 'ICT-1',
							taskName: 'React to contact',
							percentComplete: 40,
							soldierGapCount: 3
						}
					],
					atRiskSoldiers: [
						{
							personnelId: 'person-1',
							soldierName: 'Smith, Ann',
							mos: '11B',
							rank: 'SGT',
							groupName: 'Alpha',
							readinessPercent: 50,
							tasksExpiringSoonCount: 1,
							daysSinceLastIctUpdate: 45
						}
					]
				}
			})
		);

		expect(model.trainingEvals.ictl).toMatchObject({
			state: 'ready',
			readinessColor: 'var(--destructive)',
			readinessLabel: '68% ready',
			deltaLabel: 'down 4 pts vs 30d',
			primaryConcern: '3 of 8 Soldiers below 70%',
			expiringSoonLabel: '5 tasks expiring <=60d across 4 Soldiers',
			mosReadiness: [
				{ mos: '11B', personnelCount: 5, readinessPercent: 60 },
				{ mos: '68W', personnelCount: 3, readinessPercent: 92 }
			]
		});
	});
});
