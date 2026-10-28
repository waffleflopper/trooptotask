import {
	DEFAULT_LOSS_WARNING_WINDOW_DAYS,
	DEFAULT_STRENGTH_FLOOR_PERCENT,
	DEFAULT_TRAINING_READINESS_GOAL_PERCENT
} from '$features/organization/contracts';
import type { DashboardBootstrap } from '../contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { CalendarCatalogPersistence, CalendarDateRange } from '$features/calendar/contracts';
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { RatingSchemeDuePort } from '$features/rating-scheme/contracts';
import type {
	GroupPersistence,
	PersonnelAwardAcknowledgementPort,
	PersonnelRosterReader,
	SelfPinPersistence
} from '$features/personnel/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import {
	listAssignmentTypes,
	listAvailabilityEntries,
	listDailyAssignments,
	listSpecialDaysInRange,
	listStatusTypes
} from '$features/calendar/index.server';
import type { OnboardingCatalogPersistence, OnboardingWorkflowPersistence } from '$features/onboarding/contracts';
import type { TrainingCatalogPersistence } from '$features/training/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { visiblePinnedGroupNames } from '$features/personnel/index.server';
import { dashboardSourceAccess } from './dashboardSources.server';
import { runEndsCovering } from '../read-model/availabilityRuns';

type DashboardQueryContext = Parameters<typeof listAvailabilityEntries>[0] &
	Parameters<typeof listDailyAssignments>[0] & {
		auth: OrganizationAccessGrant;
		roster: Pick<PersonnelRosterReader, 'list'>;
		groups: Pick<GroupPersistence, 'listCatalog'>;
		selfPins: Pick<SelfPinPersistence, 'listNames'>;
		calendarCatalogs: Pick<CalendarCatalogPersistence, 'listAssignmentTypes' | 'listStatusTypes' | 'listSpecialDays'>;
		onboardingWorkflow: Pick<OnboardingWorkflowPersistence, 'listSavedActivePackets'>;
		onboardingCatalog: Pick<OnboardingCatalogPersistence, 'hasAnyTemplate'>;
		trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypes'>;
		organizationSettings: Pick<OrganizationSettingsReader, 'findPolicies'>;
		ratingSchemeDue?: RatingSchemeDuePort;
		personnelAwardAcknowledgement?: PersonnelAwardAcknowledgementPort;
		disabledFeatures: readonly FeatureKey[];
	};

async function loadRatingSchemeDueEntries(ctx: DashboardQueryContext): Promise<RatingSchemeDueEntry[]> {
	if (!ctx.ratingSchemeDue) throw new Error('Rating Scheme due projection port is required');
	return ctx.ratingSchemeDue.listDueEntries(ctx.auth);
}

/**
 * The layout bootstrap does not know the viewer's day, and rerunning it when the zone cookie first lands
 * would repeat the whole read. Every viewer's day is within one day of the server's UTC day, so reading
 * UTC day -2 through +15 covers viewer day -1 through +14 everywhere.
 */
function viewerDayWindowCoverage(now: Date) {
	const serverDay = toDayNumber(now.toISOString().slice(0, 10));
	return { rangeStart: fromDayNumber(serverDay - 2), rangeEnd: fromDayNumber(serverDay + 15) };
}

const CONTINUATION_LOOKAHEAD_DAYS = 31;

/**
 * Window entries plus every entry that continues an absence past the window's last day, so a return
 * date is never the end of an entry the window cut off. Each pass reads all still-absent people at once.
 */
async function listAvailabilityThroughReturns(ctx: DashboardQueryContext, range: CalendarDateRange) {
	const entries = await listAvailabilityEntries(ctx, range);
	const loaded = new Set(entries.map((entry) => entry.id));
	let checkedThrough: number = toDayNumber(range.rangeEnd);
	for (;;) {
		const absent = [...runEndsCovering(entries, range.rangeEnd)].filter(
			([, end]) => toDayNumber(end) >= checkedThrough
		);
		if (absent.length === 0) return entries;
		const furthest = Math.max(...absent.map(([, end]) => toDayNumber(end)));
		const through = furthest + 1 + CONTINUATION_LOOKAHEAD_DAYS;
		const continuations = await listAvailabilityEntries(ctx, {
			rangeStart: fromDayNumber(checkedThrough + 1),
			rangeEnd: fromDayNumber(through),
			personnelIds: absent.map(([personnelId]) => personnelId)
		});
		for (const entry of continuations) {
			if (loaded.has(entry.id)) continue;
			loaded.add(entry.id);
			entries.push(entry);
		}
		checkedThrough = through;
	}
}

export async function fetchDashboardBootstrap(ctx: DashboardQueryContext): Promise<DashboardBootstrap> {
	const orgId = ctx.auth.orgId;
	const range = viewerDayWindowCoverage(new Date());
	const reads = dashboardSourceAccess(ctx);
	const availabilityEntries = reads('availabilityEntries')
		? listAvailabilityThroughReturns(ctx, range)
		: Promise.resolve([]);
	const todayAssignments = reads('assignments') ? listDailyAssignments(ctx, range, null) : Promise.resolve([]);
	// Handle early rejections until streaming attaches its consumers. The returned
	// original promises still reject, so hydration can show the source error.
	void availabilityEntries.catch(() => undefined);
	void todayAssignments.catch(() => undefined);

	const [
		assignmentTypes,
		pinnedGroups,
		ratingSchemeEntries,
		activeOnboardings,
		hasAnyOnboardingTemplate,
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		policies,
		awardTrackingAcknowledgedPersonnelIds,
		specialDays
	] = await Promise.all([
		reads('assignmentTypes') ? listAssignmentTypes(ctx.calendarCatalogs) : [],
		ctx.selfPins.listNames(),
		reads('ratingSchemeEntries') ? loadRatingSchemeDueEntries(ctx) : [],
		reads('activeOnboardings') ? ctx.onboardingWorkflow.listSavedActivePackets() : [],
		reads('onboardingTemplates') && ctx.onboardingCatalog.hasAnyTemplate(),
		ctx.roster.list({ status: 'active' }),
		ctx.groups.listCatalog(),
		reads('statusTypes') ? listStatusTypes(ctx.calendarCatalogs) : [],
		reads('trainingTypes') ? ctx.trainingCatalog.listTypes() : [],
		ctx.organizationSettings.findPolicies(orgId),
		reads('awardAcknowledgements')
			? ctx.personnelAwardAcknowledgement
				? ctx.personnelAwardAcknowledgement.listAcknowledgedPersonnelIds(ctx.auth)
				: Promise.reject(new Error('Personnel award acknowledgement port is required'))
			: [],
		reads('specialDays') ? listSpecialDaysInRange(ctx.calendarCatalogs, range) : []
	]);

	return {
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		range,
		pinnedGroups: visiblePinnedGroupNames(pinnedGroups, groups),
		ratingSchemeEntries,
		activeOnboardings,
		hasAnyOnboardingTemplate,
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		lossWarningWindowDays: policies?.lossWarningWindowDays ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
		strengthFloorPercent: policies?.strengthFloorPercent ?? DEFAULT_STRENGTH_FLOOR_PERCENT,
		trainingReadinessGoalPercent: policies?.trainingReadinessGoalPercent ?? DEFAULT_TRAINING_READINESS_GOAL_PERCENT,
		awardTrackingAcknowledgedPersonnelIds,
		specialDays
	};
}
