// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType, DailyAssignment, AssignmentType } from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';
import { createDashboardScreenModel } from './dashboardScreenModel.svelte';
import { arrivingAndLeavingReadiness } from '../sections/readiness';
import type { DashboardWorkspaceResult } from '../contracts';
import type { DashboardPageData } from '../contracts';
function makeData(
	overrides: Partial<DashboardPageData> = {},
	workspaceOverrides: Record<string, unknown> = {}
): DashboardPageData {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		viewerDay: { date: '2026-04-23', timeZone: 'UTC' },
		disabledFeatures: [],
		dashboard: {
			workspaceKey: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				range: { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' },
				pinnedGroups: [],
				activeOnboardings: [],
				hasAnyOnboardingTemplate: true,
				ratingSchemeEntries: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: [],
				lossWarningWindowDays: 180,
				strengthFloorPercent: 80,
				awardTrackingAcknowledgedPersonnelIds: [],
				specialDays: [],
				...workspaceOverrides
			},
			hydration: { orgId: 'org-1' } as DashboardWorkspaceResult['hydration']
		},
		trainingSummary: null,
		ictlSummary: null,
		summaryFailed: false,
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

describe('Dashboard today availability', () => {
	const roster = {
		personnel: [
			{ id: 'p1', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', groupId: 'g1' },
			{ id: 'p2', rank: 'SPC', firstName: 'Bo', lastName: 'Jones', groupId: 'g1' },
			{ id: 'p3', rank: 'SPC', firstName: 'Cy', lastName: 'Lee', groupId: 'g2' },
			{ id: 'p4', rank: 'PFC', firstName: 'Di', lastName: 'Gone', groupId: 'g1', archivedAt: '2026-04-01T00:00:00Z' }
		],
		groups: [
			{ id: 'g2', name: 'Bravo', sortOrder: 2 },
			{ id: 'g1', name: 'Alpha', sortOrder: 1 }
		],
		statusTypes: [
			{ id: 'leave', name: 'Leave', color: '#aa0000', textColor: '#ffffff', sortOrder: 0 },
			{ id: 'school', name: 'School', color: '#0000aa', textColor: '#ffffff', sortOrder: 1 }
		]
	};

	it('counts each active Person out today once, under the first status type in catalog order', () => {
		const model = createDashboardScreenModel(makeData({ viewerDay: { date: '2026-04-23', timeZone: 'UTC' } }), {
			sources: makeSources({
				...roster,
				availabilityEntries: [
					{ id: 'a1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-04-22', endDate: '2026-04-24' },
					{ id: 'a2', personnelId: 'p1', statusTypeId: 'school', startDate: '2026-04-23', endDate: '2026-04-23' },
					{ id: 'a3', personnelId: 'p3', statusTypeId: 'school', startDate: '2026-04-23', endDate: '2026-04-25' },
					{ id: 'a4', personnelId: 'p4', statusTypeId: 'leave', startDate: '2026-04-23', endDate: '2026-04-23' },
					{ id: 'a5', personnelId: 'p2', statusTypeId: 'leave', startDate: '2026-04-24', endDate: '2026-04-26' },
					{ id: 'a6', personnelId: 'unknown', statusTypeId: 'leave', startDate: '2026-04-23', endDate: '2026-04-23' }
				]
			})
		});

		expect(model.totalPersonnel).toBe(3);
		const { bottomLine } = model.strength;
		expect([bottomLine.available, bottomLine.assigned, bottomLine.percent]).toEqual([1, 3, 33]);
		expect(
			bottomLine.outPeople.map(({ personnelId, name, statusTypeId }) => [personnelId, name, statusTypeId])
		).toEqual([
			['p1', 'SGT Smith, Ann', 'leave'],
			['p3', 'SPC Lee, Cy', 'school']
		]);
		expect(bottomLine.strip.map(({ statusTypeId, count }) => [statusTypeId, count])).toEqual([
			[null, 1],
			['leave', 1],
			['school', 1]
		]);
	});

	it('reuses the strength rows until a source changes', () => {
		const availability = $state({
			items: [
				{ id: 'a1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-04-23', endDate: '2026-04-23' }
			] as AvailabilityEntry[],
			loading: false
		});
		const model = createDashboardScreenModel(makeData({ viewerDay: { date: '2026-04-23', timeZone: 'UTC' } }), {
			sources: { ...makeSources(roster), availability }
		});

		const strength = model.strength;
		expect(model.strength).toBe(strength);

		availability.items = [
			...availability.items,
			{
				id: 'a2',
				personnelId: 'p2',
				statusTypeId: 'school',
				startDate: '2026-04-23',
				endDate: '2026-04-23'
			} as AvailabilityEntry
		];

		expect(model.strength).not.toBe(strength);
		expect(model.strength.bottomLine.outPeople.map(({ personnelId }) => personnelId)).toEqual(['p1', 'p2']);
	});
});

describe('Dashboard losses', () => {
	it('leaves archived People out of the readiness losses', () => {
		const model = createDashboardScreenModel(makeData({ viewerDay: { date: '2026-04-23', timeZone: 'UTC' } }), {
			sources: makeSources({
				personnel: [
					{ id: 'leaving', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', ets: '2026-06-01' },
					{
						id: 'archived',
						rank: 'SPC',
						firstName: 'Di',
						lastName: 'Gone',
						ets: '2026-05-01',
						archivedAt: '2026-04-01T00:00:00Z'
					}
				]
			})
		});

		expect(arrivingAndLeavingReadiness(model.inputs, { can: () => false, isPrivileged: false })).toMatchObject({
			figure: '1',
			note: 'Smith ETS 1 Jun.'
		});
	});
});
