import { describe, expect, it } from 'vitest';
import type { AssignmentType } from '$features/calendar/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { ExpiredTrainingType } from '$features/training/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardInputs } from './dashboardInputs';
import {
	expiredTraining,
	leavingWithoutAward,
	overdueEvaluations,
	stalledOnboarding,
	unfilledDuty
} from './needsYouSources';

const TODAY = '2026-10-19';
const FORECAST = Array.from({ length: 14 }, (_, index) => fromDayNumber(toDayNumber(TODAY) + index));

function person(id: string, rank: string, lastName: string, firstName: string, groupId: string): Personnel {
	return {
		id,
		slug: `${lastName.toLowerCase()}-${id}`,
		rank,
		lastName,
		firstName,
		mos: '68W',
		clinicRole: '',
		groupId,
		groupName: groupId
	};
}

const alvarez = person('p-alvarez', 'SSG', 'Alvarez', 'Marisol', 'alpha');
const brooks = person('p-brooks', 'PFC', 'Brooks', 'Jalen', 'alpha');
const patel = { ...person('p-patel', 'SPC', 'Patel', 'Ravi', 'bravo'), ets: '2026-11-16' };
const kim = person('p-kim', 'SGT', 'Kim', 'Dana', 'bravo');

const staffDuty: AssignmentType = {
	id: 'staff-duty',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#1f6feb',
	exemptPersonnelIds: [],
	showOnCalendar: true,
	sortOrder: 0
};

function step(
	id: string,
	overrides: Partial<PersonnelOnboarding['steps'][number]>
): PersonnelOnboarding['steps'][number] {
	return {
		id,
		onboardingId: 'onboarding-brooks',
		stepName: id,
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder: 0,
		completed: false,
		currentStage: null,
		notes: [],
		templateStepId: null,
		active: true,
		progressChangedAt: '2026-10-11T12:00:00Z',
		...overrides
	};
}

const brooksPacket: PersonnelOnboarding = {
	id: 'onboarding-brooks',
	personnelId: 'p-brooks',
	startedAt: '2026-10-11',
	completedAt: null,
	cancelledAt: null,
	status: 'in_progress',
	templateId: null,
	steps: [
		step('step-badge', { stepName: 'Badge', completed: true, sortOrder: 0 }),
		step('step-orders', {
			stepName: 'Orders packet',
			stepType: 'paperwork',
			stages: ['Drafted', 'Submitted'],
			currentStage: 'Submitted',
			sortOrder: 1,
			progressChangedAt: '2026-10-09T12:00:00Z'
		}),
		step('step-gear', { stepName: 'Gear issue', sortOrder: 2 })
	]
};

interface Loaded {
	personnel: readonly Personnel[];
	assignments?: DashboardInputs['assignments'];
	ratingSchemeEntries?: RatingSchemeDueEntry[];
	expiredByType?: ExpiredTrainingType[] | null;
	activeOnboardings?: PersonnelOnboarding[];
	onboardingTrainingCompletions?: string[];
	awardTrackingAcknowledgedPersonnelIds?: string[];
}

function inputs(loaded: Loaded): DashboardInputs {
	const range = { rangeStart: '2026-10-17', rangeEnd: '2026-11-03' };
	return {
		today: TODAY,
		timeZone: 'UTC',
		forecastDays: FORECAST,
		personnel: loaded.personnel,
		availability: [],
		statusTypes: [],
		groups: [],
		specialDays: [],
		assignmentTypes: [staffDuty],
		assignments: loaded.assignments ?? [],
		page: {
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			viewerDay: { date: TODAY, timeZone: 'UTC' },
			disabledFeatures: [],
			dashboard: {
				workspaceKey: 'dashboard',
				data: {
					availabilityEntries: [],
					specialDays: [],
					assignmentTypes: [staffDuty],
					todayAssignments: [],
					range,
					pinnedGroups: [],
					activeOnboardings: loaded.activeOnboardings ?? [],
					hasAnyOnboardingTemplate: true,
					ratingSchemeEntries: loaded.ratingSchemeEntries ?? [],
					personnel: [...loaded.personnel],
					groups: [],
					statusTypes: [],
					trainingTypes: [
						{
							id: 'sharp',
							name: 'SHARP',
							description: null,
							expirationMonths: 12,
							warningDaysYellow: 60,
							warningDaysOrange: 30,
							appliesToRoles: [],
							appliesToMos: [],
							appliesToRanks: [],
							excludedRoles: [],
							excludedMos: [],
							excludedRanks: [],
							color: '#000000',
							sortOrder: 0,
							expirationDateOnly: false,
							canBeExempted: false,
							exemptPersonnelIds: [],
							isOptional: false
						}
					],
					lossWarningWindowDays: 180,
					strengthFloorPercent: 80,
					awardTrackingAcknowledgedPersonnelIds: loaded.awardTrackingAcknowledgedPersonnelIds ?? []
				},
				hydration: {
					orgId: 'org-1',
					confirmedChangesByTab: {},
					personnel: { mode: 'replace', snapshotKey: 'personnel', items: [] },
					groups: { mode: 'replace', snapshotKey: 'groups', items: [] },
					statusTypes: { mode: 'replace', snapshotKey: 'statusTypes', items: [] },
					trainingTypes: { mode: 'replace', snapshotKey: 'trainingTypes', items: [] },
					pinnedGroups: { mode: 'replace', snapshotKey: 'pinnedGroups', items: [] },
					availabilityEntries: { mode: 'range', snapshotKey: 'availability', items: [], range },
					calendarAssignments: {
						mode: 'range',
						snapshotKey: 'assignments',
						items: { types: [], assignments: [] },
						range
					}
				}
			},
			trainingSummary:
				loaded.expiredByType === null
					? null
					: {
							stats: {
								current: 0,
								warningYellow: 0,
								warningOrange: 0,
								expired: 0,
								notCompleted: 0,
								notRequired: 0,
								total: 0
							},
							issues: [],
							expiredByType: loaded.expiredByType ?? [],
							expiredPersonnelCount: 0,
							groupDelinquencies: []
						},
			ictlSummary: null,
			summaryFailed: false,
			onboardingTrainingCompletions: loaded.onboardingTrainingCompletions ?? []
		}
	};
}

describe('overdueEvaluations', () => {
	it('names each evaluation past its thru date and leaves current and completed ones out', () => {
		const rows = overdueEvaluations(
			inputs({
				personnel: [alvarez, brooks],
				ratingSchemeEntries: [
					{
						id: 'eval-late',
						ratedPersonId: 'p-alvarez',
						evalType: 'NCOER',
						ratingPeriodEnd: '2026-10-13',
						status: 'active'
					},
					{
						id: 'eval-done',
						ratedPersonId: 'p-brooks',
						evalType: 'NCOER',
						ratingPeriodEnd: '2026-10-01',
						status: 'completed'
					},
					{
						id: 'eval-soon',
						ratedPersonId: 'p-brooks',
						evalType: 'OER',
						ratingPeriodEnd: '2026-11-01',
						status: 'active'
					}
				]
			})
		);

		expect(rows).toEqual([
			{
				kind: 'overdue',
				id: 'overdue:eval-late',
				ratingSchemeEntryId: 'eval-late',
				title: 'NCOER for SSG Alvarez, Marisol',
				subtitle: 'Thru date 13 Oct',
				timing: '6 days late',
				href: '/org/org-1/evals?entry=eval-late',
				action: expect.objectContaining({
					label: 'Update status',
					policy: POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
					mode: 'dialog'
				}),
				urgency: { daysLate: 6 }
			}
		]);
	});

	it('keeps the named overdue entry when the viewer has no Personnel roster', () => {
		const rows = overdueEvaluations(
			inputs({
				personnel: [],
				ratingSchemeEntries: [
					{
						id: 'eval-late',
						ratedPersonId: 'p-alvarez',
						ratedPersonName: 'SSG Alvarez, Marisol',
						evalType: 'NCOER',
						ratingPeriodEnd: '2026-10-13',
						status: 'active'
					}
				]
			})
		);
		expect(rows).toMatchObject([
			{
				id: 'overdue:eval-late',
				title: 'NCOER for SSG Alvarez, Marisol',
				href: '/org/org-1/evals?entry=eval-late'
			}
		]);
	});
});

describe('expiredTraining', () => {
	it('folds every expired Soldier on a training type into one row dated by the longest lapse', () => {
		const rows = expiredTraining(
			inputs({
				personnel: [alvarez, brooks, patel, kim],
				expiredByType: [
					{ trainingTypeId: 'sharp', personnelIds: ['p-alvarez', 'p-brooks', 'p-patel', 'p-kim'], maxDaysLate: 16 }
				]
			})
		);

		expect(rows).toEqual([
			{
				kind: 'expired',
				id: 'expired:sharp',
				trainingTypeId: 'sharp',
				personnelIds: ['p-alvarez', 'p-brooks', 'p-patel', 'p-kim'],
				title: '4 Soldiers expired on SHARP',
				subtitle: 'Alvarez, Brooks, Patel, Kim',
				timing: 'since 3 Oct',
				href: '/org/org-1/training/reports?types=sharp',
				action: expect.objectContaining({
					label: 'Record class',
					policy: POLICY_ACTION_CATALOG.training.recordCompletions,
					mode: 'dialog'
				}),
				urgency: { daysLate: 16 }
			}
		]);
	});

	it('names three Soldiers and counts the rest past four', () => {
		const fifth = person('p-lee', 'PV2', 'Lee', 'Sam', 'bravo');
		const [row] = expiredTraining(
			inputs({
				personnel: [alvarez, brooks, patel, kim, fifth],
				expiredByType: [
					{
						trainingTypeId: 'sharp',
						personnelIds: ['p-alvarez', 'p-brooks', 'p-patel', 'p-kim', 'p-lee'],
						maxDaysLate: 1
					}
				]
			})
		);

		expect(row.subtitle).toBe('Alvarez, Brooks, Patel and 2 more');
	});

	it('shows nothing while the Training summary is unavailable', () => {
		expect(expiredTraining(inputs({ personnel: [alvarez], expiredByType: null }))).toEqual([]);
	});
});

describe('unfilledDuty', () => {
	it('lists the open days of each Calendar lane in the 14-day window', () => {
		const filled = FORECAST.filter((date) => !['2026-10-27', '2026-10-28', '2026-11-01'].includes(date));
		const rows = unfilledDuty(
			inputs({
				personnel: [alvarez],
				assignments: filled.map((date) => ({
					id: `slot-${date}`,
					date,
					assignmentTypeId: 'staff-duty',
					assigneeId: 'p-alvarez'
				}))
			})
		);

		expect(rows).toEqual([
			{
				kind: 'unfilled',
				id: 'unfilled:staff-duty',
				assignmentTypeId: 'staff-duty',
				openDates: ['2026-10-27', '2026-10-28', '2026-11-01'],
				title: '3 Staff Duty days unfilled',
				subtitle: 'Tue 27, Wed 28 Oct, Sun 1 Nov',
				timing: 'in 8 days',
				href: '/org/org-1/calendar',
				onOpen: expect.any(Function),
				action: expect.objectContaining({
					label: 'Fill 3 days',
					policy: POLICY_ACTION_CATALOG.calendar.manageAssignments,
					mode: 'expand'
				}),
				urgency: { date: '2026-10-27' }
			}
		]);
	});
});

describe('stalledOnboarding', () => {
	it('names the stalled step, how long it has waited and the packet day', () => {
		const rows = stalledOnboarding(inputs({ personnel: [brooks], activeOnboardings: [brooksPacket] }));

		expect(rows).toEqual([
			{
				kind: 'stalled',
				id: 'stalled:onboarding-brooks',
				onboardingId: 'onboarding-brooks',
				stepId: 'step-orders',
				title: 'PFC Brooks, Jalen · onboarding',
				subtitle: 'Orders packet · waiting 10 days · 1 of 3',
				timing: 'day 9',
				href: '/org/org-1/onboarding?packet=onboarding-brooks',
				action: {
					label: 'Check off',
					policy: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
					mode: 'link',
					href: '/org/org-1/onboarding?packet=onboarding-brooks'
				},
				urgency: { date: '2026-10-09' }
			}
		]);
	});

	it('counts a Training step by the current Training record, not the saved step', () => {
		const withTraining = {
			...brooksPacket,
			steps: [
				...brooksPacket.steps,
				step('step-sharp', { stepName: 'SHARP', stepType: 'training', trainingTypeId: 'sharp', sortOrder: 3 })
			]
		};

		const [row] = stalledOnboarding(
			inputs({
				personnel: [brooks],
				activeOnboardings: [withTraining],
				onboardingTrainingCompletions: ['p-brooks-sharp']
			})
		);

		expect(row.subtitle).toBe('Orders packet · waiting 10 days · 2 of 4');
	});

	it('leaves a packet that is only moving slowly out', () => {
		const moving = {
			...brooksPacket,
			steps: brooksPacket.steps.map((entry) => ({ ...entry, progressChangedAt: '2026-10-15T12:00:00Z' }))
		};

		expect(stalledOnboarding(inputs({ personnel: [brooks], activeOnboardings: [moving] }))).toEqual([]);
	});
});

describe('leavingWithoutAward', () => {
	it('lists a loss inside the award window until the award is acknowledged', () => {
		const rows = leavingWithoutAward(inputs({ personnel: [patel] }));

		expect(rows).toEqual([
			{
				kind: 'leaving',
				id: 'leaving:p-patel',
				personnelId: 'p-patel',
				title: 'SPC Patel, Ravi ETS 16 Nov',
				subtitle: 'End-of-tour award not started',
				timing: 'in 28 days',
				href: '/org/org-1/personnel/patel-p-patel/data-sheet',
				action: expect.objectContaining({
					label: 'Award started',
					policy: POLICY_ACTION_CATALOG.personnel.manageRecords,
					resource: { kind: 'group', groupId: 'bravo' },
					mode: 'run'
				}),
				urgency: { date: '2026-11-16' }
			}
		]);
		expect(
			leavingWithoutAward(inputs({ personnel: [patel], awardTrackingAcknowledgedPersonnelIds: ['p-patel'] }))
		).toEqual([]);
	});
});

describe('Group scope', () => {
	it('keeps every Person-bound row inside the roster the viewer can see', () => {
		const loaded: Loaded = {
			personnel: [alvarez, brooks],
			ratingSchemeEntries: [
				{
					id: 'eval-alpha',
					ratedPersonId: 'p-alvarez',
					evalType: 'NCOER',
					ratingPeriodEnd: '2026-10-13',
					status: 'active'
				},
				{ id: 'eval-bravo', ratedPersonId: 'p-kim', evalType: 'NCOER', ratingPeriodEnd: '2026-10-10', status: 'active' }
			],
			expiredByType: [{ trainingTypeId: 'sharp', personnelIds: ['p-brooks', 'p-kim'], maxDaysLate: 4 }],
			activeOnboardings: [{ ...brooksPacket, id: 'onboarding-kim', personnelId: 'p-kim' }]
		};
		const scoped = inputs(loaded);

		expect(overdueEvaluations(scoped).map((row) => row.id)).toEqual(['overdue:eval-alpha']);
		expect(expiredTraining(scoped).map((row) => [row.title, row.subtitle])).toEqual([
			['1 Soldier expired on SHARP', 'Brooks']
		]);
		expect(stalledOnboarding(scoped)).toEqual([]);
		expect(leavingWithoutAward(inputs({ personnel: [alvarez, brooks] }))).toEqual([]);
		expect(leavingWithoutAward(inputs({ personnel: [alvarez, patel] })).map((row) => row.id)).toEqual([
			'leaving:p-patel'
		]);
	});
});
