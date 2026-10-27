import { describe, expect, it } from 'vitest';
import type { StatusType } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { TrainingType } from '$features/training/contracts';
import { FEATURE_KEYS, type FeatureKey } from '$lib/access/featureSwitches';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import type { DashboardIctlSummary, DashboardPageData } from '../contracts';
import type { DashboardInputs } from './dashboardInputs';
import { createDashboardAccess } from './dashboardAccess';
import { composeDashboardSections } from './dashboardSections';
import { DASHBOARD_SECTIONS } from './dashboardSectionRegistry';

const TODAY = '2026-10-19';
const owner = createDashboardAccess(createClientAccess({ membershipRole: 'owner' }));
const member = createDashboardAccess(
	createClientAccess({ membershipRole: 'member', capabilityMap: createCapabilityMap('operate') })
);

const able = { id: 'p-able', rank: 'SPC', lastName: 'Able', firstName: 'Pat', groupId: null } as Personnel;

interface SetUp {
	trainingTypes: boolean;
	activeTasks: boolean;
	ratingEntries: boolean;
	onboardingTemplate: boolean;
	summaryFailed: boolean;
}

/** A unit with one Person and every feature set up unless the case says otherwise. */
function unit(overrides: Partial<SetUp> = {}): DashboardInputs {
	const setUp: SetUp = {
		trainingTypes: true,
		activeTasks: true,
		ratingEntries: true,
		onboardingTemplate: true,
		summaryFailed: false,
		...overrides
	};
	const ratingEntry: RatingSchemeDueEntry = {
		id: 'entry-1',
		ratedPersonId: able.id,
		evalType: 'NCOER',
		ratingPeriodEnd: '2027-06-30',
		status: 'active'
	};
	const page: DashboardPageData = {
		orgId: 'org-1',
		orgName: 'Test Unit',
		taskings: { status: 'off' },
		userId: 'user-1',
		viewerDay: { date: TODAY, timeZone: 'UTC' },
		disabledFeatures: [],
		dashboard: {
			workspaceKey: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				range: { rangeStart: TODAY, rangeEnd: TODAY },
				pinnedGroups: [],
				activeOnboardings: [],
				hasAnyOnboardingTemplate: setUp.onboardingTemplate,
				ratingSchemeEntries: setUp.ratingEntries ? [ratingEntry] : [],
				personnel: [able],
				groups: [],
				statusTypes: [],
				trainingTypes: setUp.trainingTypes ? [{ id: 'sharp', name: 'SHARP' } as TrainingType] : [],
				lossWarningWindowDays: 180,
				strengthFloorPercent: 80,
				awardTrackingAcknowledgedPersonnelIds: [],
				specialDays: []
			},
			hydration: { orgId: 'org-1' } as DashboardPageData['dashboard']['hydration']
		},
		trainingSummary: setUp.summaryFailed
			? null
			: {
					stats: {
						current: 1,
						expired: 0,
						warningOrange: 0,
						warningYellow: 0,
						notCompleted: 0,
						notRequired: 0,
						total: 1
					},
					issues: [],
					expiredByType: [],
					expiredPersonnelCount: 0,
					missingPersonnelCount: 0,
					groupDelinquencies: []
				},
		ictlSummary: setUp.summaryFailed
			? null
			: ({
					hasActiveTasks: setUp.activeTasks,
					overallReadinessPercent: 100,
					overallDeltaPercent: 0,
					soldiersBelowThresholdCount: 0,
					soldiersAtRiskCount: 0,
					soldiersBelowThresholdTotal: 1,
					thresholdPercent: 70,
					expiringSoonCount: 0,
					expiringSoonWindowDays: 60
				} as DashboardIctlSummary),
		summaryFailed: setUp.summaryFailed,
		onboardingTrainingCompletions: []
	};
	return {
		today: TODAY,
		timeZone: 'UTC',
		forecastDays: [],
		personnel: [able],
		specialDays: [],
		availability: [],
		statusTypes: [{ id: 'leave' } as StatusType],
		groups: [],
		assignmentTypes: [],
		assignments: [],
		page
	};
}

function compose(loaded: DashboardInputs, access = owner, disabled: readonly FeatureKey[] = []) {
	const parts = composeDashboardSections(DASHBOARD_SECTIONS, loaded, disabled, access);
	return {
		columns: parts.readinessColumns.map((column) => column.id),
		quickAdd: parts.quickAdd.map((entry) => entry.label),
		onDuty: parts.onDutyBlocks.map((block) => block.id),
		hints: parts.setupHints.map((hint) => hint.feature),
		parts
	};
}

describe('a unit with every feature set up', () => {
	it('shows every column and quick add and gives no hint', () => {
		expect(compose(unit())).toMatchObject({
			columns: ['training', 'critical-tasks', 'evaluations', 'arriving-and-leaving'],
			quickAdd: ['Status', 'Training record', 'Start onboarding', 'Tasking'],
			hints: []
		});
	});
});

describe('frame 05: Critical tasks off and Onboarding with no template', () => {
	const loaded = unit({ onboardingTemplate: false });

	it('gives an owner three columns, no Start onboarding and one Onboarding hint', () => {
		const { columns, quickAdd, parts } = compose(loaded, owner, ['criticalTasks']);

		expect(columns).toEqual(['training', 'evaluations', 'arriving-and-leaving']);
		expect(quickAdd).toEqual(['Status', 'Training record', 'Tasking']);
		expect(parts.readinessColumns.at(-1)?.link).toEqual({ label: 'Personnel', href: '/org/org-1/personnel' });
		expect(parts.setupHints).toEqual([
			{
				feature: 'onboarding',
				message: "Onboarding is on, but there are no templates yet, so it isn't shown here.",
				fix: { label: 'Create a template', href: '/org/org-1/onboarding/templates' },
				turnOff: { label: 'Turn off onboarding', href: '/org/org-1/settings/features' }
			}
		]);
	});

	it('gives a member the same page without the hint', () => {
		expect(compose(loaded, member, ['criticalTasks'])).toMatchObject({
			columns: ['training', 'evaluations', 'arriving-and-leaving'],
			quickAdd: ['Status', 'Training record', 'Tasking'],
			hints: []
		});
	});
});

describe('a feature that is on but not set up', () => {
	it.each([
		['training', { trainingTypes: false }, 'training', 'Add a training type', '/org/org-1/training/types'],
		['criticalTasks', { activeTasks: false }, 'critical-tasks', 'Add a task', '/org/org-1/critical-tasks/library'],
		['evaluations', { ratingEntries: false }, 'evaluations', 'Add an entry', '/org/org-1/evals']
	] as const)('drops %s for everyone and hints the owner', (feature, gap, column, fixLabel, fixHref) => {
		const loaded = unit(gap);
		const forOwner = compose(loaded, owner);

		expect(forOwner.columns).not.toContain(column);
		expect(forOwner.parts.setupHints.map(({ feature, fix }) => ({ feature, fix }))).toEqual([
			{ feature, fix: { label: fixLabel, href: fixHref } }
		]);
		expect(compose(loaded, member).columns).toEqual(forOwner.columns);
		expect(compose(loaded, member).hints).toEqual([]);
	});

	it('reads a failed summary as unknown, keeping the failed columns and giving no Critical Tasks hint', () => {
		const { columns, hints, parts } = compose(unit({ summaryFailed: true }));

		expect(columns).toEqual(['training', 'critical-tasks', 'evaluations', 'arriving-and-leaving']);
		expect(hints).toEqual([]);
		expect(parts.needsYouUnavailable).toEqual(['Training']);
	});
});

describe('every optional feature off', () => {
	it('keeps Availability, Status and On duty and hints nothing, even when nothing is set up', () => {
		const loaded = unit({ trainingTypes: false, activeTasks: false, ratingEntries: false, onboardingTemplate: false });

		expect(compose(loaded, owner, FEATURE_KEYS)).toMatchObject({
			columns: [],
			quickAdd: ['Status'],
			onDuty: ['tonight-and-tomorrow', 'coming-and-going'],
			hints: []
		});
	});
});
