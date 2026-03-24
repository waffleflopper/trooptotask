import type { UseCaseContext } from '$lib/server/core/ports';
import type { AvailabilityEntry, AssignmentType, DailyAssignment } from '$lib/types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { formatDate } from '$lib/utils/dates';

export interface DashboardData {
	availabilityEntries: AvailabilityEntry[];
	assignmentTypes: AssignmentType[];
	todayAssignments: DailyAssignment[];
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeEntry[];
	activeOnboardings: PersonnelOnboarding[];
}

export async function fetchDashboardData(ctx: UseCaseContext): Promise<DashboardData> {
	const orgId = ctx.auth.orgId;
	const userId = ctx.auth.userId;

	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));

	const [availabilityRows, assignmentTypeRows, dailyAssignmentRows, pinnedGroupRows, ratingSchemeRows, onboardingRows] =
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
			})
		]);

	const allOnboardings = PersonnelOnboardingEntity.fromDbArray(onboardingRows);
	const activeOnboardings = allOnboardings.filter((o) => o.status === 'in_progress');

	return {
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		todayAssignments: DailyAssignmentEntity.fromDbArray(dailyAssignmentRows),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows),
		activeOnboardings
	};
}
