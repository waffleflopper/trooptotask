import type { SupabaseClient } from '$lib/server/database';

export interface CriticalTaskRetentionSource {
	deleteExpired(orgId: string, cutoff: string): Promise<number>;
}

export function createSupabaseCriticalTaskRetentionSource(client: SupabaseClient): CriticalTaskRetentionSource {
	return {
		async deleteExpired(orgId, cutoff) {
			const { data, error } = await client.rpc('delete_expired_unreferenced_critical_tasks', {
				p_org_id: orgId,
				p_cutoff: cutoff
			});
			if (error) throw new Error(error.message);
			if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0)
				throw new Error('Critical task retention returned no valid deletion count');
			return data;
		}
	};
}
