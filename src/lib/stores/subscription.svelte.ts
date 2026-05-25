/**
 * Subscription store — current org's billing tier and seat/quota state.
 *
 * Loaded once per layout render with `load(effectiveTier)`. Exposes reactive getters
 * for gating UI features behind tier checks and displaying subscription banners.
 *
 * Key derived values:
 * - `isReadOnly`: subscription lapsed; all writes should be blocked
 * - `hasBanner`: true when the subscription warning banner should show (expiring gift or read-only)
 * - `personnelCap`: max personnel for the current tier (Infinity for unlimited tiers)
 * - `isGifted`: org is on a gifted tier, not a paid subscription
 *
 * Only active when PUBLIC_BILLING_ENABLED is set; `billingEnabled` reflects this.
 */
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG, type EffectiveTier, type Tier } from '$lib/types/subscription';

function createSubscriptionStore() {
	let effectiveTier = $state<EffectiveTier | null>(null);

	return {
		get tier() {
			return effectiveTier;
		},
		get isReadOnly() {
			return effectiveTier?.isReadOnly ?? false;
		},
		get personnelCount() {
			return effectiveTier?.personnelCount ?? 0;
		},
		get personnelCap() {
			return effectiveTier?.personnelCap ?? Infinity;
		},
		get readOnlyReason() {
			return effectiveTier?.readOnlyReason ?? null;
		},
		get currentTier() {
			return effectiveTier?.tier ?? ('free' as Tier);
		},
		get tierConfig() {
			return TIER_CONFIG[effectiveTier?.tier ?? 'free'];
		},
		get isGifted() {
			return effectiveTier?.source === 'gift';
		},
		get giftExpiresAt() {
			return effectiveTier?.giftExpiresAt ? new Date(effectiveTier.giftExpiresAt) : null;
		},
		get giftDaysRemaining() {
			if (!effectiveTier?.giftExpiresAt) return null;
			const diff = new Date(effectiveTier.giftExpiresAt).getTime() - Date.now();
			return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
		},
		get hasBanner() {
			if (!isBillingEnabled) return false;
			const isGifted = effectiveTier?.source === 'gift';
			const giftExpiring =
				isGifted &&
				effectiveTier?.giftExpiresAt != null &&
				Math.max(
					0,
					Math.ceil((new Date(effectiveTier.giftExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
				) <= 14;
			return giftExpiring || (effectiveTier?.isReadOnly ?? false);
		},
		get billingEnabled() {
			return isBillingEnabled;
		},

		load(tier: EffectiveTier) {
			effectiveTier = tier;
		},

		clear() {
			effectiveTier = null;
		}
	};
}

export const subscriptionStore = createSubscriptionStore();
