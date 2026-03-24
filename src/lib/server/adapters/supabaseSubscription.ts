import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionPort } from '$lib/server/core/ports';
import {
	canAddPersonnel,
	getEffectiveTier,
	invalidateTierCache,
	getMonthlyExportCount
} from '$lib/server/subscription';

export function createSupabaseSubscriptionAdapter(supabase: SupabaseClient, orgId: string): SubscriptionPort {
	return {
		async canAddPersonnel() {
			return canAddPersonnel(supabase, orgId);
		},
		async getAvailablePersonnelSlots() {
			const tier = await getEffectiveTier(supabase, orgId);
			if (tier.personnelCap === Infinity || tier.personnelCap === null) return null;
			return Math.max(0, tier.personnelCap - tier.personnelCount);
		},
		invalidateTierCache() {
			invalidateTierCache(orgId);
		},
		async getEffectiveTier() {
			return getEffectiveTier(supabase, orgId);
		},
		async getMonthlyExportCount() {
			return getMonthlyExportCount(supabase, orgId);
		}
	};
}
