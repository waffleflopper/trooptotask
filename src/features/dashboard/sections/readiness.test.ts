import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { DashboardIctlSummary, DashboardPageData } from '../contracts';
import type { DashboardInputs } from './dashboardInputs';
import type { DashboardAccess } from './dashboardSections';
import {
	arrivingAndLeavingReadiness,
	criticalTasksReadiness,
	evaluationsReadiness,
	trainingReadiness
} from './readiness';

const TODAY = '2026-10-19';
const everything: DashboardAccess = { can: () => true };
const only = (...ids: string[]): DashboardAccess => ({ can: (action) => ids.includes(action.id) });

function person(id: string, groupId: string | null, extra: Partial<Personnel> = {}): Personnel {
	return {
		id,
		slug: id,
		rank: 'SPC',
		lastName: id,
		firstName: 'Pat',
		mos: '68W',
		clinicRole: '',
		groupId,
		groupName: groupId ?? '',
		...extra
	};
}

interface Loaded {
	today?: string;
	personnel?: Personnel[];
	groups?: Group[];
	trainingSummary?: DashboardPageData['trainingSummary'];
	ictlSummary?: DashboardIctlSummary | null;
	summaryFailed?: boolean;
	ratingSchemeEntries?: Partial<RatingSchemeDueEntry>[];
	activeOnboardings?: Partial<PersonnelOnboarding>[];
	lossWarningWindowDays?: number;
}

function inputs(loaded: Loaded = {}): DashboardInputs {
	const today = loaded.today ?? TODAY;
	return {
		today,
		timeZone: 'UTC',
		forecastDays: [],
		personnel: loaded.personnel ?? [],
		specialDays: [],
		availability: [],
		statusTypes: [],
		groups: loaded.groups ?? [],
		assignmentTypes: [],
		assignments: [],
		page: {
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			viewerDay: { date: today, timeZone: 'UTC' },
			disabledFeatures: [],
			dashboard: {
				workspaceKey: 'dashboard',
				data: {
					availabilityEntries: [],
					assignmentTypes: [],
					todayAssignments: [],
					range: { rangeStart: today, rangeEnd: today },
					pinnedGroups: [],
					activeOnboardings: (loaded.activeOnboardings ?? []) as PersonnelOnboarding[],
					ratingSchemeEntries: (loaded.ratingSchemeEntries ?? []) as RatingSchemeDueEntry[],
					personnel: [],
					groups: [],
					statusTypes: [],
					trainingTypes: [],
					lossWarningWindowDays: loaded.lossWarningWindowDays ?? 180,
					strengthFloorPercent: 80,
					awardTrackingAcknowledgedPersonnelIds: [],
					specialDays: []
				},
				hydration: { orgId: 'org-1' } as DashboardPageData['dashboard']['hydration']
			},
			trainingSummary: loaded.trainingSummary ?? null,
			ictlSummary: loaded.ictlSummary ?? null,
			summaryFailed: loaded.summaryFailed ?? false,
			onboardingTrainingCompletions: []
		}
	};
}

function trainingSummary(
	expiredPersonnelCount: number,
	groupDelinquencies: { groupId: string | null; expired: number; delinquent: number }[]
): DashboardPageData['trainingSummary'] {
	return {
		stats: { current: 0, expired: 0, warningOrange: 0, warningYellow: 0, notCompleted: 0, notRequired: 0, total: 0 },
		issues: [],
		expiredByType: [],
		expiredPersonnelCount,
		groupDelinquencies: groupDelinquencies.map(({ groupId, expired, delinquent }) => ({
			groupId,
			expiredPersonnelCount: expired,
			delinquentPersonnelCount: delinquent
		}))
	};
}

describe('trainingReadiness', () => {
	it('counts People, not records, as current, expiring or expired and names the lowest Group', () => {
		const column = trainingReadiness(
			inputs({
				personnel: [person('a1', 'alpha'), person('a2', 'alpha'), person('b1', 'bravo'), person('b2', 'bravo')],
				groups: [
					{ id: 'bravo', name: 'Bravo', sortOrder: 1 },
					{ id: 'alpha', name: 'Alpha', sortOrder: 0 }
				],
				trainingSummary: trainingSummary(1, [
					{ groupId: 'alpha', expired: 0, delinquent: 1 },
					{ groupId: 'bravo', expired: 1, delinquent: 2 }
				])
			}),
			everything
		);

		expect(column).toEqual({
			id: 'training',
			title: 'Training',
			link: { label: 'Training reports', href: '/org/org-1/training/reports' },
			state: 'ready',
			figure: '25%',
			figureTone: 'critical',
			suffix: 'current',
			graphic: {
				kind: 'shares',
				shares: [
					{ label: 'current', count: 1, tone: 'good' },
					{ label: 'expiring', count: 2, tone: 'warning' },
					{ label: 'expired', count: 1, tone: 'critical' }
				]
			},
			note: '1 Soldier expired and 2 expiring. Bravo is lowest at 0%.'
		});
	});

	it.each([
		{ total: 10, delinquent: 1, figure: '90%', tone: 'good' },
		{ total: 100, delinquent: 11, figure: '89%', tone: 'warning' },
		{ total: 4, delinquent: 1, figure: '75%', tone: 'warning' },
		{ total: 100, delinquent: 26, figure: '74%', tone: 'critical' }
	])('colors $figure current $tone at the 90 and 75 percent cutoffs', ({ total, delinquent, figure, tone }) => {
		const column = trainingReadiness(
			inputs({
				personnel: Array.from({ length: total }, (_, index) => person(`p${index}`, null)),
				trainingSummary: trainingSummary(0, [{ groupId: null, expired: 0, delinquent }])
			}),
			everything
		);

		expect(column).toMatchObject({ figure, figureTone: tone });
	});

	it.each([0, 1])('reads yellow-only Training as everyone current with %i People', (count) => {
		const column = trainingReadiness(
			inputs({ personnel: count ? [person('p1', null)] : [], trainingSummary: trainingSummary(0, []) }),
			everything
		);

		expect(column).toMatchObject({ figure: '100%', figureTone: 'good', note: 'Everyone is current.' });
	});

	it('shows nothing when the summary withholds Training, and the failure only to a viewer who could read it', () => {
		expect(trainingReadiness(inputs(), everything)).toBeNull();
		expect(trainingReadiness(inputs({ summaryFailed: true }), only())).toBeNull();
		expect(trainingReadiness(inputs({ summaryFailed: true }), only('training.viewRecords'))).toEqual({
			id: 'training',
			title: 'Training',
			link: { label: 'Training reports', href: '/org/org-1/training/reports' },
			state: 'failed',
			subject: 'Training currency'
		});
	});
});

const ictlSummary: DashboardIctlSummary = {
	hasActiveTasks: true,
	overallReadinessPercent: 57,
	overallDeltaPercent: 3,
	readyCount: 57,
	applicableCount: 100,
	soldiersBelowThresholdCount: 15,
	soldiersAtRiskCount: 2,
	soldiersBelowThresholdTotal: 20,
	thresholdPercent: 70,
	expiringSoonCount: 4,
	expiringSoonAffectedSoldiers: 3,
	expiringSoonWindowDays: 30,
	tasksBelowThresholdCount: 6,
	projectedReadinessPercent: 55,
	mosReadiness: [],
	trend: [],
	tasksBelowThreshold: [],
	atRiskSoldiers: []
};

describe('criticalTasksReadiness', () => {
	it('splits the Soldiers with an applicable task into disjoint ready, at-risk and below-threshold shares', () => {
		expect(criticalTasksReadiness(inputs({ ictlSummary }), everything)).toEqual({
			id: 'critical-tasks',
			title: 'Critical tasks',
			link: { label: 'Critical tasks', href: '/org/org-1/critical-tasks' },
			state: 'ready',
			figure: '57%',
			suffix: 'ready',
			trend: 3,
			graphic: {
				kind: 'shares',
				shares: [
					{ label: 'ready', count: 3, tone: 'good' },
					{ label: 'at risk', count: 2, tone: 'warning' },
					{ label: 'below 70%', count: 15, tone: 'critical' }
				]
			},
			note: '15 of 20 Soldiers below the 70% threshold; 4 tasks lapse within 30 days.'
		});
	});

	it('says no Soldier has an applicable task yet', () => {
		const empty = {
			...ictlSummary,
			soldiersBelowThresholdCount: 0,
			soldiersAtRiskCount: 0,
			soldiersBelowThresholdTotal: 0
		};

		expect(criticalTasksReadiness(inputs({ ictlSummary: empty }), everything)).toMatchObject({
			note: 'No Soldier has an applicable task yet.'
		});
	});

	it('shows nothing without the CT summary, and the failure only to a viewer who could read it', () => {
		expect(criticalTasksReadiness(inputs(), everything)).toBeNull();
		expect(criticalTasksReadiness(inputs({ summaryFailed: true }), only('training.viewRecords'))).toBeNull();
		expect(criticalTasksReadiness(inputs({ summaryFailed: true }), only('criticalTasks.viewReadiness'))).toMatchObject({
			state: 'failed',
			subject: 'Critical Tasks readiness'
		});
	});
});

describe('evaluationsReadiness', () => {
	afterEach(() => vi.useRealTimers());

	it("buckets the rating periods against the viewer's day, not the browser clock", () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-30T00:00:00'));
		const ratingSchemeEntries = [
			{ ratingPeriodEnd: '2026-09-25', status: 'active' },
			{ ratingPeriodEnd: '2026-09-28', status: 'active' },
			{ ratingPeriodEnd: '2026-10-20', status: 'active' },
			{ ratingPeriodEnd: '2026-10-10', status: 'change-of-rater' },
			{ ratingPeriodEnd: '2026-10-25', status: 'active' },
			{ ratingPeriodEnd: '2026-10-15', status: 'active' },
			{ ratingPeriodEnd: '2026-11-14', status: 'active' },
			{ ratingPeriodEnd: '2026-12-29', status: 'active' },
			{ ratingPeriodEnd: '2026-07-02', status: 'completed' }
		] as Partial<RatingSchemeDueEntry>[];

		expect(evaluationsReadiness(inputs({ today: '2026-09-30', ratingSchemeEntries }), everything)).toEqual({
			id: 'evaluations',
			title: 'Evaluations',
			link: { label: 'Evals', href: '/org/org-1/evals' },
			state: 'ready',
			figure: '2',
			figureTone: 'critical',
			suffix: 'overdue',
			graphic: {
				kind: 'shares',
				shares: [
					{ label: 'overdue', count: 2, tone: 'critical' },
					{ label: 'due within 60 days', count: 5, tone: 'warning' },
					{ label: 'current', count: 1, tone: 'good' }
				]
			},
			note: '4 more due within 30 days and 1 within 60. 1 is current.'
		});
	});

	it('reads none overdue in the body color', () => {
		expect(evaluationsReadiness(inputs(), everything)).toMatchObject({
			figure: '0',
			figureTone: undefined,
			note: 'None due within 60 days. 0 are current.'
		});
	});

	it('shows nothing to a viewer who cannot read rating entries', () => {
		expect(evaluationsReadiness(inputs(), only('training.viewRecords'))).toBeNull();
	});
});

describe('arrivingAndLeavingReadiness', () => {
	const leaving = [
		person('Kim', null, { ets: '2027-01-15' }),
		person('Patel', null, { ets: '2026-11-16' }),
		person('Ruiz', null, { deros: '2026-12-08' }),
		person('Lee', null, { ets: '2026-10-29' }),
		person('Stays', null, { ets: '2028-06-01' })
	];

	it('counts the losses in the window, marks each on the line and names the nearest', () => {
		const column = arrivingAndLeavingReadiness(
			inputs({
				personnel: leaving,
				lossWarningWindowDays: 100,
				activeOnboardings: [
					{ id: 'packet-1', personnelId: 'Stays' },
					{ id: 'packet-2', personnelId: 'outside-scope' }
				]
			}),
			everything
		);

		expect(column).toEqual({
			id: 'arriving-and-leaving',
			title: 'Arriving and leaving',
			link: { label: 'Onboarding', href: '/org/org-1/onboarding' },
			state: 'ready',
			figure: '4',
			suffix: 'leaving in 100 days',
			graphic: {
				kind: 'timeline',
				ticks: [
					{ id: 'Lee', offsetPercent: 10 },
					{ id: 'Patel', offsetPercent: 28 },
					{ id: 'Ruiz', offsetPercent: 50 },
					{ id: 'Kim', offsetPercent: 88 }
				]
			},
			note: 'Lee ETS 29 Oct, Patel ETS 16 Nov, Ruiz PCS 8 Dec and 1 more. 1 Soldier in onboarding.'
		});
	});

	it('leaves onboarding out for a viewer who cannot see it', () => {
		expect(arrivingAndLeavingReadiness(inputs({ lossWarningWindowDays: 100 }), only())).toMatchObject({
			link: { label: 'Personnel', href: '/org/org-1/personnel' },
			figure: '0',
			note: 'No one leaves in the next 100 days.'
		});
		expect(arrivingAndLeavingReadiness(inputs({ lossWarningWindowDays: 100 }), everything)).toMatchObject({
			note: 'No one leaves in the next 100 days. No one in onboarding.'
		});
	});
});
