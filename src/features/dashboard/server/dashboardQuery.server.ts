import { DEFAULT_LOSS_WARNING_WINDOW_DAYS, DEFAULT_STRENGTH_FLOOR_PERCENT } from '$features/organization/contracts';
import type { DashboardBootstrap } from '../contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { CalendarCatalogPersistence } from '$features/calendar/contracts';
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
	listStatusTypes
} from '$features/calendar/index.server';
import type { OnboardingWorkflowPersistence } from '$features/onboarding/contracts';
import type { TrainingCatalogPersistence } from '$features/training/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { visiblePinnedGroupNames } from '$features/personnel/index.server';

type DashboardQueryContext = Parameters<typeof listAvailabilityEntries>[0] &
	Parameters<typeof listDailyAssignments>[0] & {
		auth: OrganizationAccessGrant;
		roster: Pick<PersonnelRosterReader, 'list'>;
		groups: Pick<GroupPersistence, 'listCatalog'>;
		selfPins: Pick<SelfPinPersistence, 'listNames'>;
		calendarCatalogs: Pick<CalendarCatalogPersistence, 'listAssignmentTypes' | 'listStatusTypes'>;
		onboardingWorkflow: Pick<OnboardingWorkflowPersistence, 'listSavedActivePackets'>;
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

export async function fetchDashboardBootstrap(ctx: DashboardQueryContext): Promise<DashboardBootstrap> {
	const orgId = ctx.auth.orgId;
	const range = viewerDayWindowCoverage(new Date());
	const availabilityEntries = listAvailabilityEntries(ctx, range);
	const todayAssignments = listDailyAssignments(ctx, range, null);
	// Handle early rejections until streaming attaches its consumers. The returned
	// original promises still reject, so hydration can show the source error.
	void availabilityEntries.catch(() => undefined);
	void todayAssignments.catch(() => undefined);
	const isOff = (feature: FeatureKey) => ctx.disabledFeatures.includes(feature);

	const [
		assignmentTypes,
		pinnedGroups,
		ratingSchemeEntries,
		activeOnboardings,
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		policies,
		awardTrackingAcknowledgedPersonnelIds
	] = await Promise.all([
		listAssignmentTypes(ctx.calendarCatalogs),
		ctx.selfPins.listNames(),
		isOff('evaluations') ? [] : loadRatingSchemeDueEntries(ctx),
		isOff('onboarding') ? [] : ctx.onboardingWorkflow.listSavedActivePackets(),
		ctx.roster.list({ status: 'active' }),
		ctx.groups.listCatalog(),
		listStatusTypes(ctx.calendarCatalogs),
		isOff('training') ? [] : ctx.trainingCatalog.listTypes(),
		ctx.organizationSettings.findPolicies(orgId),
		isOff('lossesAndAwards')
			? []
			: ctx.personnelAwardAcknowledgement
				? ctx.personnelAwardAcknowledgement.listAcknowledgedPersonnelIds(ctx.auth)
				: Promise.reject(new Error('Personnel award acknowledgement port is required'))
	]);

	return {
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		range,
		pinnedGroups: visiblePinnedGroupNames(pinnedGroups, groups),
		ratingSchemeEntries,
		activeOnboardings,
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		lossWarningWindowDays: policies?.lossWarningWindowDays ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
		strengthFloorPercent: policies?.strengthFloorPercent ?? DEFAULT_STRENGTH_FLOOR_PERCENT,
		awardTrackingAcknowledgedPersonnelIds
	};
}
