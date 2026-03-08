import type { SupabaseClient } from '@supabase/supabase-js';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG, type EffectiveTier, type Tier } from '$lib/types/subscription';

/**
 * Get the effective tier for an org.
 * When billing is disabled, returns unlimited tier.
 */
export async function getEffectiveTier(
	supabase: SupabaseClient,
	orgId: string
): Promise<EffectiveTier> {
	if (!isBillingEnabled) {
		return {
			tier: 'unit',
			source: 'default',
			personnelCount: 0, // Not fetched when billing disabled — UI hidden in this mode
			personnelCap: Infinity,
			isReadOnly: false,
			giftExpiresAt: null,
			giftTier: null
		};
	}

	const { data, error } = await supabase.rpc('get_effective_tier', { p_org_id: orgId });
	if (error) throw error;
	return data as EffectiveTier;
}

/**
 * Check if an org can add more personnel.
 */
export async function canAddPersonnel(
	supabase: SupabaseClient,
	orgId: string
): Promise<{ allowed: boolean; message?: string }> {
	if (!isBillingEnabled) return { allowed: true };

	const tier = await getEffectiveTier(supabase, orgId);
	if (tier.isReadOnly) {
		return {
			allowed: false,
			message: 'Organization is in read-only mode. Please subscribe or remove personnel.'
		};
	}
	if (tier.personnelCount >= tier.personnelCap) {
		return {
			allowed: false,
			message: `Personnel limit reached (${tier.personnelCap}). Upgrade to add more.`
		};
	}
	return { allowed: true };
}

/**
 * Check if an org is in read-only mode.
 */
export async function isOrgReadOnly(
	supabase: SupabaseClient,
	orgId: string
): Promise<boolean> {
	if (!isBillingEnabled) return false;
	const tier = await getEffectiveTier(supabase, orgId);
	return tier.isReadOnly;
}

/**
 * Check how many orgs a user owns.
 */
export async function getUserOwnedOrgCount(
	supabase: SupabaseClient,
	userId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('organizations')
		.select('*', { count: 'exact', head: true })
		.eq('created_by', userId);
	if (error) throw error;
	return count ?? 0;
}

/**
 * Check if user can create a new org based on their highest tier.
 */
export async function canCreateOrg(
	supabase: SupabaseClient,
	userId: string
): Promise<{ allowed: boolean; message?: string }> {
	if (!isBillingEnabled) return { allowed: true };

	const ownedCount = await getUserOwnedOrgCount(supabase, userId);

	const { data: orgs } = await supabase
		.from('organizations')
		.select('id, tier, gift_tier, gift_expires_at, stripe_subscription_id, subscription_status')
		.eq('created_by', userId);

	let highestMaxOrgs = TIER_CONFIG.free.maxOrgsOwned;
	for (const org of orgs ?? []) {
		const tierResult = await getEffectiveTier(supabase, org.id);
		const config = TIER_CONFIG[tierResult.tier];
		if (config.maxOrgsOwned > highestMaxOrgs) {
			highestMaxOrgs = config.maxOrgsOwned;
		}
	}

	if (ownedCount >= highestMaxOrgs) {
		return {
			allowed: false,
			message: `You can own up to ${highestMaxOrgs} organization(s) on your current plan.`
		};
	}
	return { allowed: true };
}

/**
 * Count bulk data exports this month for an org.
 */
export async function getMonthlyExportCount(
	supabase: SupabaseClient,
	orgId: string
): Promise<number> {
	const now = new Date();
	const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

	const { count, error } = await supabase
		.from('data_exports')
		.select('*', { count: 'exact', head: true })
		.eq('org_id', orgId)
		.gte('created_at', startOfMonth.toISOString());
	if (error) throw error;
	return count ?? 0;
}
