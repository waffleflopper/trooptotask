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
	}
) {
	const priceId = input.priceId?.trim();
	if (!priceId) return;
	entries.push({
		priceId,
		commercialPlan: input.commercialPlan,
		stripeProductId: input.stripeProductId ?? null
	});
}

export function buildPriceCatalog(config: PriceCatalogConfig): PriceCatalogEntry[] {
	const entries: PriceCatalogEntry[] = [];

	addCatalogEntry(entries, {
		priceId: config.teamPriceId,
		commercialPlan: 'team',
		stripeProductId: config.teamProductId
	});
	for (const priceId of normalizePriceIdList(config.teamLegacyPriceIds)) {
		addCatalogEntry(entries, {
			priceId,
			commercialPlan: 'team',
			stripeProductId: config.teamProductId
		});
	}

	addCatalogEntry(entries, {
		priceId: config.unitPriceId,
		commercialPlan: 'unit',
		stripeProductId: config.unitProductId
	});
	for (const priceId of normalizePriceIdList(config.unitLegacyPriceIds)) {
		addCatalogEntry(entries, {
			priceId,
			commercialPlan: 'unit',
			stripeProductId: config.unitProductId
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

export function getConfiguredPriceCatalog(): PriceCatalogEntry[] {
	return buildPriceCatalog({
		teamPriceId: env.STRIPE_TEAM_PRICE_ID,
		unitPriceId: env.STRIPE_UNIT_PRICE_ID,
		teamLegacyPriceIds: env.STRIPE_TEAM_LEGACY_PRICE_IDS,
		unitLegacyPriceIds: env.STRIPE_UNIT_LEGACY_PRICE_IDS
	});
}
