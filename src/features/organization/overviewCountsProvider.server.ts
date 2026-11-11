import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { OrganizationOverviewCountsPort } from './overviewCounts.server';

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
			const groups = await selectAllSupabaseRows<{ id: string }>(async (from, to) =>
				supabase
					.from('groups')
					.select('id')
					.eq('organization_id', orgId)
					.order('id')
					.range(from, to)
					.returns<{ id: string }[]>()
			);
			if (groups.error) throw new Error("Couldn't read the unit's Groups.");
			const liveGroupIds = (groups.data ?? []).map((group) => group.id);
			const { count, error } = await supabase
				.from('organization_memberships')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId)
				.eq('role', 'member')
				.eq('access_scope_kind', 'groups')
				.not('access_scope_group_ids', 'ov', `{${liveGroupIds.join(',')}}`);
			if (error) throw new Error(error.message);
			return count ?? 0;
		}
	};
}
