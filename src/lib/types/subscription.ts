export type Tier = 'free' | 'team' | 'unit';
export type TierSource = 'subscription' | 'gift' | 'default';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'paused';

export interface EffectiveTier {
	tier: Tier;
	source: TierSource;
	personnelCount: number;
	personnelCap: number;
	isReadOnly: boolean;
	giftExpiresAt: string | null;
	giftTier: Tier | null;
}

export interface TierConfig {
	name: string;
	personnelCap: number;
	maxOrgsOwned: number;
	bulkExportsPerMonth: number;
	priceMonthly: number;
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
	free: {
		name: 'Free',
		personnelCap: 15,
		maxOrgsOwned: 1,
		bulkExportsPerMonth: 3,
		priceMonthly: 0
	},
	team: {
		name: 'Team',
		personnelCap: 80,
		maxOrgsOwned: 1,
		bulkExportsPerMonth: Infinity,
		priceMonthly: 1500 // cents
	},
	unit: {
		name: 'Unit',
		personnelCap: Infinity,
		maxOrgsOwned: Infinity,
		bulkExportsPerMonth: Infinity,
		priceMonthly: 3000 // cents
	}
};
