/**
 * Personnel page data fetching — extracts query logic from +page.server.ts
 * into a testable module. Uses repository layer for all reads.
 * See #216 / #227.
 */
import { pinnedGroupRepo, ratingSchemeRepo } from '$lib/server/repositories';
import type { QueryModifier } from '$lib/server/repositoryFactory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context
type SupabaseClient = any;

export async function fetchPersonnelData(supabase: SupabaseClient, orgId: string, userId: string | null) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type
	const userFilter: QueryModifier = (q: any) => q.eq('user_id', userId);

	const [pinnedGroups, ratingSchemeEntries] = await Promise.all([
		userId ? pinnedGroupRepo.list(supabase, orgId, { filters: [userFilter] }) : Promise.resolve([]),
		ratingSchemeRepo.list(supabase, orgId)
	]);

	return {
		pinnedGroups,
		ratingSchemeEntries
	};
}
