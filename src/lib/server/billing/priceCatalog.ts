import { STRIPE_TEAM_PRICE_ID, STRIPE_UNIT_PRICE_ID } from '$env/static/private';
import type { PriceCatalogEntry, Tier } from '$lib/types/subscription';

export interface PriceCatalogConfig {
	teamPriceId?: string | null;
	unitPriceId?: string | null;
	teamProductId?: string | null;
	unitProductId?: string | null;
}

export interface PriceCatalogLookupResult {
	ok: true;
	entry: PriceCatalogEntry;
}

export interface PriceCatalogLookupFailure {
	ok: false;
	reason: 'missing_price_id' | 'unknown_price_id' | 'duplicate_price_id';
	priceId: string | null;
}

export type PriceCatalogLookup = PriceCatalogLookupResult | PriceCatalogLookupFailure;

const PLAN_ORDER: Tier[] = ['free', 'team', 'unit'];

export function compareCommercialPlans(left: Tier, right: Tier): number {
	return PLAN_ORDER.indexOf(left) - PLAN_ORDER.indexOf(right);
}

export function buildPriceCatalog(config: PriceCatalogConfig): PriceCatalogEntry[] {
	const entries: PriceCatalogEntry[] = [];

	if (config.teamPriceId) {
		entries.push({
			priceId: config.teamPriceId,
			commercialPlan: 'team',
			stripeProductId: config.teamProductId ?? null
		});
	}

	if (config.unitPriceId) {
		entries.push({
			priceId: config.unitPriceId,
			commercialPlan: 'unit',
			stripeProductId: config.unitProductId ?? null
		});
	}

	const duplicatePriceId = entries.find((entry, index) =>
		entries.some((candidate, candidateIndex) => candidateIndex !== index && candidate.priceId === entry.priceId)
	)?.priceId;
	if (duplicatePriceId) {
		throw new Error(`Duplicate Stripe price ID configured: ${duplicatePriceId}`);
	}

	return entries;
}

export function lookupPriceCatalogEntry(
	catalog: PriceCatalogEntry[],
	priceId: string | null | undefined
): PriceCatalogLookup {
	if (!priceId) {
		return { ok: false, reason: 'missing_price_id', priceId: null };
	}

	const matches = catalog.filter((candidate) => candidate.priceId === priceId);
	if (matches.length > 1) {
		return { ok: false, reason: 'duplicate_price_id', priceId };
	}
	const entry = matches[0];
	if (!entry) {
		return { ok: false, reason: 'unknown_price_id', priceId };
	}

	return { ok: true, entry };
}

export const configuredPriceCatalog = buildPriceCatalog({
	teamPriceId: STRIPE_TEAM_PRICE_ID,
	unitPriceId: STRIPE_UNIT_PRICE_ID
});
