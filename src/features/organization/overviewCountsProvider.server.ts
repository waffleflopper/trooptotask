import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { countScopesCoveringNoGroups, type OrganizationOverviewCountsPort } from './overviewCounts.server';

export function createSupabaseOrganizationOverviewCountsPort(
	supabase: SupabaseClient,
	orgId: string
): OrganizationOverviewCountsPort {
	return {
		async countActiveUngroupedPeople() {
			const { count, error } = await supabase
				.from('personnel')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId)
				.is('archived_at', null)
				.is('group_id', null);
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		async countMembersCoveringNoGroups() {
			const [groups, scopes] = await Promise.all([
				selectAllSupabaseRows<{ id: string }>(async (from, to) =>
					supabase
						.from('groups')
						.select('id')
						.eq('organization_id', orgId)
						.order('id')
						.range(from, to)
						.returns<{ id: string }[]>()
				),
				selectAllSupabaseRows<{ access_scope_group_ids: string[] | null }>(async (from, to) =>
					supabase
						.from('organization_memberships')
						.select('access_scope_group_ids')
						.eq('organization_id', orgId)
						.eq('role', 'member')
						.eq('access_scope_kind', 'groups')
						.order('id')
						.range(from, to)
						.returns<{ access_scope_group_ids: string[] | null }[]>()
				)
			]);
			if (groups.error || scopes.error) throw new Error("Couldn't read member scopes.");
			return countScopesCoveringNoGroups(
				(groups.data ?? []).map((group) => group.id),
				(scopes.data ?? []).map((row) => row.access_scope_group_ids)
			);
		}
	};
}
