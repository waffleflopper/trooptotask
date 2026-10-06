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
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { RatingSchemeDuePort } from '$features/rating-scheme/contracts';
import type { PersonnelAwardAcknowledgementPort } from '$features/personnel/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import {
	listAssignmentTypes,
	listAvailabilityEntries,
	listDailyAssignments,
	listStatusTypes
} from '$features/calendar/index.server';
import { listActiveOnboardings } from '$features/onboarding/index.server';
import { listTrainingTypes } from '$features/training/index.server';
import { formatDate } from '$lib/utils/dates';
import { listGroupCatalog, listPinnedGroupNames, loadRosterPersonnel } from '$features/personnel/index.server';

type DashboardQueryContext = Parameters<typeof listAvailabilityEntries>[0] &
	Parameters<typeof listDailyAssignments>[0] &
	Parameters<typeof listPinnedGroupNames>[0] &
	Parameters<typeof loadRosterPersonnel>[0] & {
		store: Parameters<typeof listActiveOnboardings>[0] & Parameters<typeof listTrainingTypes>[0];
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
		listAssignmentTypes(ctx.store, orgId),
		listPinnedGroupNames(ctx),
		loadRatingSchemeDueEntries(ctx),
		listActiveOnboardings(ctx.store, orgId),
		loadRosterPersonnel(ctx, { status: 'active' }),
		listGroupCatalog(ctx),
		listStatusTypes(ctx.store, orgId),
		listTrainingTypes(ctx.store, orgId),
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
		pinnedGroups,
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
