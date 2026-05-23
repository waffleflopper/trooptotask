import { describe, expect, it } from 'vitest';
import { buildPriceCatalog, lookupPriceCatalogEntry } from './priceCatalog';

describe('billing price catalog', () => {
	it('maps configured Stripe price IDs to internal commercial plans', () => {
		const catalog = buildPriceCatalog({
			teamPriceId: 'price_team',
			unitPriceId: 'price_unit',
			teamProductId: 'prod_team'
		});

		expect(lookupPriceCatalogEntry(catalog, 'price_team')).toEqual({
			ok: true,
			entry: {
				priceId: 'price_team',
				commercialPlan: 'team',
				stripeProductId: 'prod_team'
			}
		});
		expect(lookupPriceCatalogEntry(catalog, 'price_unit')).toEqual({
			ok: true,
			entry: {
				priceId: 'price_unit',
				commercialPlan: 'unit',
				stripeProductId: null
			}
		});
	});

	it('rejects unknown or missing Stripe prices by default', () => {
		const catalog = buildPriceCatalog({ teamPriceId: 'price_team' });

		expect(lookupPriceCatalogEntry(catalog, 'price_unknown')).toEqual({
			ok: false,
			reason: 'unknown_price_id',
			priceId: 'price_unknown'
		});
		expect(lookupPriceCatalogEntry(catalog, null)).toEqual({
			ok: false,
			reason: 'missing_price_id',
			priceId: null
		});
	});
});
