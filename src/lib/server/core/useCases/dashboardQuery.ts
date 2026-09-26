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
import type { Personnel, StatusType, AvailabilityEntry, AssignmentType, DailyAssignment } from '$lib/types';
import type { Group } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/training.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { formatDate } from '$lib/utils/dates';
import { listAwardTrackingAcknowledgedPersonnelIds } from './personnelAwardTracking';
import { listGroupCatalog, listPinnedGroupNames, loadRosterPersonnel } from '$features/personnel/index.server';

export interface DashboardData {
	availabilityEntries: AvailabilityEntry[];
	assignmentTypes: AssignmentType[];
	todayAssignments: DailyAssignment[];
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeEntry[];
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
	ratingSchemeEntries: RatingSchemeEntry[];
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
	const availabilityEntries = ctx.store
		.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
			select: AvailabilityEntryEntity.select,
			rangeFilters: [
				{ column: 'end_date', op: 'gte', value: yesterday },
				{ column: 'start_date', op: 'lte', value: twoWeeksOut }
			]
		})
		.then((rows) => AvailabilityEntryEntity.fromDbArray(rows));
	const todayAssignments = ctx.store
		.findMany<Record<string, unknown>>('daily_assignments', orgId, undefined, {
			rangeFilters: [
				{ column: 'date', op: 'gte', value: yesterday },
				{ column: 'date', op: 'lte', value: twoWeeksOut }
			]
		})
		.then((rows) => DailyAssignmentEntity.fromDbArray(rows));

	const [
		assignmentTypeRows,
		pinnedGroups,
		ratingSchemeRows,
		activeOnboardings,
		personnel,
		groups,
		statusTypeRows,
		trainingTypeRows,
		orgSettingsRow,
		awardTrackingAcknowledgedPersonnelIds
	] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		listPinnedGroupNames(ctx),
		ctx.store.findMany<Record<string, unknown>>('rating_scheme_entries', orgId, undefined, {
			select: 'id, rated_person_id, eval_type, rating_period_end, status',
			orderBy: [{ column: 'rating_period_end', ascending: true }]
		}),
		loadActiveOnboardings(ctx, orgId),
		loadRosterPersonnel(ctx, { status: 'active' }),
		listGroupCatalog(ctx),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			select: StatusTypeEntity.select,
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('training_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store
			.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
			.catch(() => null),
		listAwardTrackingAcknowledgedPersonnelIds(ctx.store, orgId)
	]);
	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

	return {
		availabilityEntries,
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		todayAssignments,
		pinnedGroups,
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows),
		activeOnboardings,
		personnel,
		groups,
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		trainingTypes: TrainingTypeEntity.fromDbArray(trainingTypeRows),
		lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds
	};
}

export async function fetchDashboardData(ctx: QueryPorts): Promise<DashboardData> {
	const orgId = ctx.auth.orgId;

	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));

	const [availabilityRows, assignmentTypeRows, dailyAssignmentRows, pinnedGroups, ratingSchemeRows, activeOnboardings] =
		await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
				select: AvailabilityEntryEntity.select,
				rangeFilters: [
					{ column: 'end_date', op: 'gte', value: yesterday },
					{ column: 'start_date', op: 'lte', value: twoWeeksOut }
				]
			}),
			ctx.store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('daily_assignments', orgId, undefined, {
				rangeFilters: [
					{ column: 'date', op: 'gte', value: yesterday },
					{ column: 'date', op: 'lte', value: twoWeeksOut }
				]
			}),
			listPinnedGroupNames(ctx),
			ctx.store.findMany<Record<string, unknown>>('rating_scheme_entries', orgId, undefined, {
				select: 'id, rated_person_id, eval_type, rating_period_end, status',
				orderBy: [{ column: 'rating_period_end', ascending: true }]
			}),
			loadActiveOnboardings(ctx, orgId)
		]);

	return {
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		todayAssignments: DailyAssignmentEntity.fromDbArray(dailyAssignmentRows),
		pinnedGroups,
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows),
		activeOnboardings
	};
}
