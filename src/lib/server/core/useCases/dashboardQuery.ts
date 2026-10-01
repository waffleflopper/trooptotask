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
import type { QueryPorts } from '$lib/server/core/ports';
import type { Personnel } from '$features/personnel/contracts';
import type { StatusType, AvailabilityEntry, AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';
import {
	listAssignmentTypes,
	listAvailabilityEntries,
	listDailyAssignments,
	listStatusTypes
} from '$features/calendar/index.server';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { listTrainingTypes } from '$features/training/index.server';
import { formatDate } from '$lib/utils/dates';
import { listAwardTrackingAcknowledgedPersonnelIds } from './personnelAwardTracking';
import { listGroupCatalog, listPinnedGroupNames, loadRosterPersonnel } from '$features/personnel/index.server';

export interface DashboardData {
	availabilityEntries: AvailabilityEntry[];
	assignmentTypes: AssignmentType[];
	todayAssignments: DailyAssignment[];
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeDueEntry[];
	activeOnboardings: PersonnelOnboarding[];
}

/**
 * `DashboardBootstrap` includes the org-scoped reference collections
 * needed to hydrate dashboard stores and render lookup-backed widgets. Callers receive the
 * full non-null `personnel`, `groups`, `statusTypes`, and `trainingTypes` arrays for the
 * organization, with entity IDs unique within each collection, and should treat them as
 * read-only bootstrap/cache data rather than mutable dashboard state.
 */
export interface DashboardBootstrap {
	availabilityEntries: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	assignmentTypes: AssignmentType[];
	todayAssignments: DailyAssignment[] | Promise<DailyAssignment[]>;
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeDueEntry[];
	activeOnboardings: PersonnelOnboarding[];
	personnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	trainingTypes: TrainingType[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
	/** Personnel IDs whose award tracking has been acknowledged. */
	awardTrackingAcknowledgedPersonnelIds: string[];
}

async function loadRatingSchemeDueEntries(ctx: QueryPorts): Promise<RatingSchemeDueEntry[]> {
	if (!ctx.ratingSchemeDue) throw new Error('Rating Scheme due projection port is required');
	return ctx.ratingSchemeDue.listDueEntries(ctx.auth);
}

async function loadActiveOnboardings(ctx: QueryPorts, orgId: string) {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel_onboardings',
		orgId,
		{ status: 'in_progress' },
		{ select: PersonnelOnboardingEntity.select }
	);
	return PersonnelOnboardingEntity.fromDbArray(rows);
}

export async function fetchDashboardBootstrap(ctx: QueryPorts): Promise<DashboardBootstrap> {
	const orgId = ctx.auth.orgId;
	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));
	const availabilityEntries = listAvailabilityEntries(ctx, { rangeStart: yesterday, rangeEnd: twoWeeksOut });
	const todayAssignments = listDailyAssignments(ctx, { rangeStart: yesterday, rangeEnd: twoWeeksOut }, null);

	const [
		assignmentTypes,
		pinnedGroups,
		ratingSchemeEntries,
		activeOnboardings,
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		orgSettingsRow,
		awardTrackingAcknowledgedPersonnelIds
	] = await Promise.all([
		listAssignmentTypes(ctx.store, orgId),
		listPinnedGroupNames(ctx),
		loadRatingSchemeDueEntries(ctx),
		loadActiveOnboardings(ctx, orgId),
		loadRosterPersonnel(ctx, { status: 'active' }),
		listGroupCatalog(ctx),
		listStatusTypes(ctx.store, orgId),
		listTrainingTypes(ctx.store, orgId),
		ctx.store
			.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
			.catch(() => null),
		listAwardTrackingAcknowledgedPersonnelIds(ctx)
	]);
	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

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

export async function fetchDashboardData(ctx: QueryPorts): Promise<DashboardData> {
	const orgId = ctx.auth.orgId;

	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));

	const [availabilityEntries, assignmentTypes, todayAssignments, pinnedGroups, ratingSchemeEntries, activeOnboardings] =
		await Promise.all([
			listAvailabilityEntries(ctx, { rangeStart: yesterday, rangeEnd: twoWeeksOut }),
			listAssignmentTypes(ctx.store, orgId),
			listDailyAssignments(ctx, { rangeStart: yesterday, rangeEnd: twoWeeksOut }, null),
			listPinnedGroupNames(ctx),
			loadRatingSchemeDueEntries(ctx),
			loadActiveOnboardings(ctx, orgId)
		]);

	return {
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		pinnedGroups,
		ratingSchemeEntries,
		activeOnboardings
	};
}
