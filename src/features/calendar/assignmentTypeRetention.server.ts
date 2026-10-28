import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export interface AssignmentTypeRetentionSource {
	deleteExpired(orgId: string, cutoff: string): Promise<number>;
}

export function createSupabaseAssignmentTypeRetention(client: SupabaseClient): AssignmentTypeRetentionSource {
	return {
		async deleteExpired(orgId, cutoff) {
			const result = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('assignment_types')
					.select('id')
					.eq('organization_id', orgId)
					.not('archived_at', 'is', null)
					.lt('archived_at', cutoff)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			const ids = (result.data ?? []).map((row) => row.id);
			if (ids.length === 0) return 0;
			const { data, error } = await client.rpc('delete_expired_unreferenced_assignment_types', {
				p_org_id: orgId,
				p_candidate_ids: ids,
				p_cutoff: cutoff
			});
			if (error) throw new Error(error.message);
			if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0)
				throw new Error('Assignment type retention returned no deletion count');
			return data;
		}
	};
}
