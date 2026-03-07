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
