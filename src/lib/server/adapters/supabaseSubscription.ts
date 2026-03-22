import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionPort } from '$lib/server/core/ports';
import { canAddPersonnel, invalidateTierCache } from '$lib/server/subscription';

export function createSupabaseSubscriptionAdapter(supabase: SupabaseClient, orgId: string): SubscriptionPort {
	return {
		async canAddPersonnel() {
			return canAddPersonnel(supabase, orgId);
		},
		invalidateTierCache() {
			invalidateTierCache(orgId);
		}
	};
}
