import type { SupabaseClient } from '$lib/server/database';
import type { OnboardingRetentionStore } from './onboardingRetentionPorts.server';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export function createSupabaseOnboardingRetentionSource(client: SupabaseClient): OnboardingRetentionStore {
	return {
		async listExpired(orgId, status, cutoff) {
			const timestamp = status === 'completed' ? 'completed_at' : 'cancelled_at';
			const result = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_onboardings')
					.select('id')
					.eq('organization_id', orgId)
					.eq('status', status)
					.not(timestamp, 'is', null)
					.lt(timestamp, cutoff)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return result.data ?? [];
		},
		async deleteExpiredBatch(orgId, status, ids, cutoff) {
			if (ids.length === 0) return 0;
			const timestamp = status === 'completed' ? 'completed_at' : 'cancelled_at';
			const { data, error } = await client
				.from('personnel_onboardings')
				.delete()
				.eq('organization_id', orgId)
				.in('id', ids)
				.eq('status', status)
				.lt(timestamp, cutoff)
				.select('id');
			if (error) throw new Error(error.message);
			return data?.length ?? 0;
		}
	};
}
