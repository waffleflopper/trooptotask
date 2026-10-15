import { DEFAULT_LOSS_WARNING_WINDOW_DAYS } from '$features/organization/contracts';
/**
 * Dashboard query use case — fetches all data needed to render the dashboard widgets.
 *
 * Returns availability entries, daily assignments, assignment types, pinned groups,
 * rating scheme entries, and active onboarding records for a given date window.
 * Scoped collections are filtered through feature-owned Policy Decisions and Scope Set data.
 *
 * Separate from `calendarQuery.ts` because the dashboard shows different widgets and
 * includes data (onboarding, rating scheme) the calendar page doesn't need.
 */
import type { DashboardBootstrap } from '../contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
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
import { formatDate } from '$lib/utils/dates';
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
		organizationSettings: Pick<OrganizationSettingsReader, 'findLossWarningWindowDays'>;
		ratingSchemeDue?: RatingSchemeDuePort;
		personnelAwardAcknowledgement?: PersonnelAwardAcknowledgementPort;
	};

async function loadRatingSchemeDueEntries(ctx: DashboardQueryContext): Promise<RatingSchemeDueEntry[]> {
	if (!ctx.ratingSchemeDue) throw new Error('Rating Scheme due projection port is required');
	return ctx.ratingSchemeDue.listDueEntries(ctx.auth);
}

export async function fetchDashboardBootstrap(ctx: DashboardQueryContext): Promise<DashboardBootstrap> {
	const orgId = ctx.auth.orgId;
	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));
	const availabilityEntries = listAvailabilityEntries(ctx, { rangeStart: yesterday, rangeEnd: twoWeeksOut });
	const todayAssignments = listDailyAssignments(ctx, { rangeStart: yesterday, rangeEnd: twoWeeksOut }, null);
	// Handle early rejections until streaming attaches its consumers. The returned
	// original promises still reject, so hydration can show the source error.
	void availabilityEntries.catch(() => undefined);
	void todayAssignments.catch(() => undefined);

	const [
		assignmentTypes,
		pinnedGroups,
		ratingSchemeEntries,
		activeOnboardings,
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		warningWindow,
		awardTrackingAcknowledgedPersonnelIds
	] = await Promise.all([
		listAssignmentTypes(ctx.calendarCatalogs),
		ctx.selfPins.listNames(),
		loadRatingSchemeDueEntries(ctx),
		ctx.onboardingWorkflow.listSavedActivePackets(),
		ctx.roster.list({ status: 'active' }),
		ctx.groups.listCatalog(),
		listStatusTypes(ctx.calendarCatalogs),
		ctx.trainingCatalog.listTypes(),
		ctx.organizationSettings.findLossWarningWindowDays(orgId),
		ctx.personnelAwardAcknowledgement
			? ctx.personnelAwardAcknowledgement.listAcknowledgedPersonnelIds(ctx.auth)
			: Promise.reject(new Error('Personnel award acknowledgement port is required'))
	]);
	const lossWarningWindowDays = warningWindow ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS;

	return {
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		range: { rangeStart: yesterday, rangeEnd: twoWeeksOut },
		pinnedGroups: visiblePinnedGroupNames(pinnedGroups, groups),
		ratingSchemeEntries,
		activeOnboardings,
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds
	};
}
