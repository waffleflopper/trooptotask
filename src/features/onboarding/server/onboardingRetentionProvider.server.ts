import type { SupabaseClient } from '@supabase/supabase-js';
import type { OnboardingRetentionStore } from './onboardingRetentionPorts.server';

/** Bind after cron admission. One filtered parent DELETE owns its existing progress cascade. */
export function createSupabaseOnboardingRetentionSource(
	client: SupabaseClient
): Pick<OnboardingRetentionStore, 'deleteExpiredBatch'> {
	return {
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
