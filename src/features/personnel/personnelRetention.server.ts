import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export interface PersonnelRetentionSource {
	deleteExpired(orgId: string, cutoff: string): Promise<number>;
}

/**
 * Bind only after cron admission. Parent deletion is one database transaction;
 * its cascades retire the deleted records' stored keys for scheduled cleanup.
 */
export function createSupabasePersonnelRetentionSource(client: SupabaseClient): PersonnelRetentionSource {
	return {
		async deleteExpired(orgId, cutoff) {
			const candidates = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('personnel')
					.select('id')
					.eq('organization_id', orgId)
					.not('archived_at', 'is', null)
					.lt('archived_at', cutoff)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (candidates.error)
				throw new Error((candidates.error as { message?: string }).message ?? 'Expired Personnel read failed');
			const ids = (candidates.data ?? []).map((row) => row.id);
			if (ids.length === 0) return 0;

			const { data: deletedCount, error } = await client.rpc('delete_expired_personnel', {
				p_org_id: orgId,
				p_candidate_ids: ids,
				p_cutoff: cutoff
			});
			if (error) throw new Error(error.message);
			if (typeof deletedCount !== 'number' || !Number.isInteger(deletedCount) || deletedCount < 0)
				throw new Error('Personnel retention returned no valid deletion count');
			return deletedCount;
		}
	};
}
