/**
 * Dashboard data fetching — extracts query logic from +page.server.ts
 * into a testable module. Uses repository layer for all org-scoped reads.
 * See #216 / #227.
 */
import { formatDate } from '$lib/utils/dates';
import { availabilityRepo, dailyAssignmentRepo, pinnedGroupRepo, ratingSchemeRepo } from '$lib/server/repositories';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { findOnboardings } from '$lib/server/onboardingRepository';
import type { QueryModifier } from '$lib/server/repositoryFactory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context
type SupabaseClient = any;

export async function fetchDashboardData(supabase: SupabaseClient, orgId: string, userId: string | null) {
	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type
	const dateOverlapFilter: QueryModifier = (q: any) => q.gte('end_date', yesterday).lte('start_date', twoWeeksOut);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type
	const dailyDateFilter: QueryModifier = (q: any) => q.gte('date', yesterday).lte('date', twoWeeksOut);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type
	const excludeCompleted: QueryModifier = (q: any) => q.neq('status', 'completed');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type
	const userFilter: QueryModifier = (q: any) => q.eq('user_id', userId);

	const [availabilityEntries, assignmentTypes, todayAssignments, pinnedGroups, ratingSchemeEntries, onboardingsResult] =
		await Promise.all([
			availabilityRepo.list(supabase, orgId, { filters: [dateOverlapFilter] }),
			AssignmentTypeEntity.repo.list(supabase, orgId),
			dailyAssignmentRepo.list(supabase, orgId, { filters: [dailyDateFilter] }),
			userId ? pinnedGroupRepo.list(supabase, orgId, { filters: [userFilter] }) : Promise.resolve([]),
			ratingSchemeRepo.list(supabase, orgId, {
				select: 'id, rated_person_id, eval_type, rating_period_end, status',
				filters: [excludeCompleted]
			}),
			findOnboardings(supabase, orgId)
		]);

	const activeOnboardings = onboardingsResult.data.filter((o) => o.status === 'in_progress');

	return {
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		pinnedGroups,
		ratingSchemeEntries,
		activeOnboardings
	};
}
