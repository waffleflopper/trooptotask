/**
 * Dashboard query use case — fetches all data needed to render the dashboard widgets.
 *
 * Returns availability entries, daily assignments, assignment types, pinned groups,
 * rating scheme entries, and active onboarding records for a given date window.
 * All collections are group-scoped when the caller has a `scopedGroupId`.
 *
 * Separate from `calendarQuery.ts` because the dashboard shows different widgets and
 * includes data (onboarding, rating scheme) the calendar page doesn't need.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import type { Personnel, StatusType, AvailabilityEntry, AssignmentType, DailyAssignment } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { formatDate } from '$lib/utils/dates';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import { listDutyEventsInRange } from './dutyEventCrud';

export interface DashboardData {
	availabilityEntries: AvailabilityEntry[];
	assignmentTypes: AssignmentType[];
	todayAssignments: DailyAssignment[];
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeEntry[];
	activeOnboardings: PersonnelOnboarding[];
	todayDutyEvents: DutyEvent[];
}

/**
 * `DashboardBootstrap` extends `DashboardData` with the org-scoped reference collections
 * needed to hydrate dashboard stores and render lookup-backed widgets. Callers receive the
 * full non-null `personnel`, `groups`, `statusTypes`, and `trainingTypes` arrays for the
 * organization, with entity IDs unique within each collection, and should treat them as
 * read-only bootstrap/cache data rather than mutable dashboard state.
 */
export interface DashboardBootstrap extends DashboardData {
	personnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	trainingTypes: TrainingType[];
}

export async function fetchDashboardBootstrap(ctx: QueryPorts): Promise<DashboardBootstrap> {
	const orgId = ctx.auth.orgId;

	const [dashboardData, personnelRows, groupRows, statusTypeRows, trainingTypeRows] = await Promise.all([
		fetchDashboardData(ctx),
		ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('training_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		})
	]);

	return {
		...dashboardData,
		personnel: PersonnelEntity.fromDbArray(personnelRows),
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		trainingTypes: TrainingTypeEntity.fromDbArray(trainingTypeRows)
	};
}

export async function fetchDashboardData(ctx: QueryPorts): Promise<DashboardData> {
	const orgId = ctx.auth.orgId;
	const userId = ctx.auth.userId;

	const serverNow = new Date();
	const today = formatDate(serverNow);
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));

	const [availabilityRows, assignmentTypeRows, dailyAssignmentRows, pinnedGroupRows, ratingSchemeRows, onboardingRows, todayDutyEvents] =
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
			userId
				? ctx.store.findMany<Record<string, unknown>>(
						'user_pinned_groups',
						orgId,
						{ user_id: userId },
						{
							orderBy: [{ column: 'sort_order', ascending: true }]
						}
					)
				: Promise.resolve([]),
			ctx.store.findMany<Record<string, unknown>>('rating_scheme_entries', orgId, undefined, {
				select: 'id, rated_person_id, eval_type, rating_period_end, status',
				orderBy: [{ column: 'rating_period_end', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', orgId, undefined, {
				select: PersonnelOnboardingEntity.select
			}),
			listDutyEventsInRange(ctx, { rangeStart: today, rangeEnd: today }).catch(() => [] as DutyEvent[])
		]);

	const allOnboardings = PersonnelOnboardingEntity.fromDbArray(onboardingRows);
	const activeOnboardings = allOnboardings.filter((o) => o.status === 'in_progress');

	return {
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		todayAssignments: DailyAssignmentEntity.fromDbArray(dailyAssignmentRows),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows),
		activeOnboardings,
		todayDutyEvents
	};
}
