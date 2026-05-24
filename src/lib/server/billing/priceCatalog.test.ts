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

	it('rejects duplicate configured Stripe price IDs', () => {
		expect(() =>
			buildPriceCatalog({
				teamPriceId: 'price_shared',
				unitPriceId: 'price_shared'
			})
		).toThrow('Duplicate Stripe price ID configured: price_shared');

		expect(
			lookupPriceCatalogEntry(
				[
					{ priceId: 'price_shared', commercialPlan: 'team', stripeProductId: 'prod_team' },
					{ priceId: 'price_shared', commercialPlan: 'unit', stripeProductId: 'prod_unit' }
				],
				'price_shared'
			)
		).toEqual({ ok: false, reason: 'duplicate_price_id', priceId: 'price_shared' });
	});
});
