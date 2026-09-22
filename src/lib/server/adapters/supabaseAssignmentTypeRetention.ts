import type { SupabaseClient } from '@supabase/supabase-js';

/** The database locks each type before checking Calendar references and deleting it. */
export function createSupabaseAssignmentTypeRetention(client: SupabaseClient) {
	return {
		async deleteExpiredUnreferenced(orgId: string, ids: string[], cutoff: string): Promise<number> {
			if (ids.length === 0) return 0;
			const { data, error } = await client.rpc('delete_expired_unreferenced_assignment_types', {
				p_org_id: orgId,
				p_candidate_ids: ids,
				p_cutoff: cutoff
			});
			if (error) throw new Error(error.message);
			if (typeof data !== 'number') throw new Error('Assignment type retention returned no deletion count');
			return data;
		}
	};
}
