import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

/** Current administrator membership facts; notification delivery supplies actor exclusion. */
export function createSupabaseOrganizationAdministratorRecipients(getAdminClient: () => SupabaseClient) {
	return async (orgId: string): Promise<{ userIds: string[]; errorMessage: string | null }> => {
		const admin = getAdminClient();
		const result = await selectAllSupabaseRows<{ user_id: string }>(async (from, to) => {
			const { data, error } = await admin
				.from('organization_memberships')
				.select('user_id')
				.eq('organization_id', orgId)
				.in('role', ['owner', 'admin'])
				.order('user_id', { ascending: true })
				.range(from, to);
			return { data, error };
		});
		if (result.error) {
			return { userIds: [], errorMessage: (result.error as { message: string }).message };
		}
		return { userIds: (result.data ?? []).map(({ user_id }) => user_id), errorMessage: null };
	};
}
