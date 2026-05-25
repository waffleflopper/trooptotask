import { env } from '$env/dynamic/private';
import type { PriceCatalogEntry, Tier } from '$lib/types/subscription';

export interface PriceCatalogConfig {
	teamPriceId?: string | null;
	unitPriceId?: string | null;
	teamLegacyPriceIds?: string[] | string | null;
	unitLegacyPriceIds?: string[] | string | null;
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

export interface CheckoutPriceCatalogLookupFailure {
	ok: false;
	reason: 'unsupported_plan' | 'missing_price_id' | 'duplicate_checkout_price';
	commercialPlan: string | null;
}

export type CheckoutPriceCatalogLookup = PriceCatalogLookupResult | CheckoutPriceCatalogLookupFailure;

const PLAN_ORDER: Tier[] = ['free', 'team', 'unit'];

export function compareCommercialPlans(left: Tier, right: Tier): number {
	return PLAN_ORDER.indexOf(left) - PLAN_ORDER.indexOf(right);
}

function normalizePriceIdList(value: string[] | string | null | undefined): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.map((priceId) => priceId.trim()).filter(Boolean);
	return value
		.split(',')
		.map((priceId) => priceId.trim())
		.filter(Boolean);
}

function addCatalogEntry(
	entries: PriceCatalogEntry[],
	input: {
		priceId: string | null | undefined;
		commercialPlan: Exclude<Tier, 'free'>;
		stripeProductId?: string | null;
		activeForCheckout: boolean;
	}
) {
	const priceId = input.priceId?.trim();
	if (!priceId) return;
	entries.push({
		priceId,
		commercialPlan: input.commercialPlan,
		stripeProductId: input.stripeProductId ?? null,
		activeForCheckout: input.activeForCheckout
	});
}

export function buildPriceCatalog(config: PriceCatalogConfig): PriceCatalogEntry[] {
	const entries: PriceCatalogEntry[] = [];

	addCatalogEntry(entries, {
		priceId: config.teamPriceId,
		commercialPlan: 'team',
		stripeProductId: config.teamProductId,
		activeForCheckout: true
	});
	for (const priceId of normalizePriceIdList(config.teamLegacyPriceIds)) {
		addCatalogEntry(entries, {
			priceId,
			commercialPlan: 'team',
			stripeProductId: config.teamProductId,
			activeForCheckout: false
		});
	}

	addCatalogEntry(entries, {
		priceId: config.unitPriceId,
		commercialPlan: 'unit',
		stripeProductId: config.unitProductId,
		activeForCheckout: true
	});
	for (const priceId of normalizePriceIdList(config.unitLegacyPriceIds)) {
		addCatalogEntry(entries, {
			priceId,
			commercialPlan: 'unit',
			stripeProductId: config.unitProductId,
			activeForCheckout: false
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

export function lookupCheckoutPriceCatalogEntry(
	catalog: PriceCatalogEntry[],
	commercialPlan: string | null | undefined
): CheckoutPriceCatalogLookup {
	if (commercialPlan !== 'team' && commercialPlan !== 'unit') {
		return { ok: false, reason: 'unsupported_plan', commercialPlan: commercialPlan ?? null };
	}

	const matches = catalog.filter(
		(candidate) => candidate.commercialPlan === commercialPlan && candidate.activeForCheckout === true
	);
	if (matches.length === 0) {
		return { ok: false, reason: 'missing_price_id', commercialPlan };
	}
	if (matches.length > 1) {
		return { ok: false, reason: 'duplicate_checkout_price', commercialPlan };
	}

	return { ok: true, entry: matches[0] };
}

export function getConfiguredPriceCatalog(): PriceCatalogEntry[] {
	return buildPriceCatalog({
		teamPriceId: env.STRIPE_TEAM_PRICE_ID,
		unitPriceId: env.STRIPE_UNIT_PRICE_ID,
		teamLegacyPriceIds: env.STRIPE_TEAM_LEGACY_PRICE_IDS,
		unitLegacyPriceIds: env.STRIPE_UNIT_LEGACY_PRICE_IDS
	});
}
