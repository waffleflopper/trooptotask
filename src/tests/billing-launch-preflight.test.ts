import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type PreflightLevel = 'pass' | 'warn' | 'fail';

interface PreflightResult {
	level: PreflightLevel;
	label: string;
	detail: string;
}

interface StripePreflightModule {
	checkPrice: (
		results: PreflightResult[],
		price: {
			ok: boolean;
			label: 'Team' | 'Unit';
			id: string;
			livemode: boolean;
			active: boolean;
			recurring: string | null;
			recurringIntervalCount: number | null;
			currency: string;
			unitAmount: number;
			productId: string;
		}
	) => void;
	checkPortalConfiguration: (
		results: PreflightResult[],
		configurations: Array<Record<string, unknown>>,
		prices: {
			team: { ok: boolean; id: string; productId: string };
			unit: { ok: boolean; id: string; productId: string };
		}
	) => void;
}

async function loadPreflightModule(): Promise<StripePreflightModule> {
	return import(pathToFileURL(resolve('scripts/billing-launch-preflight.mjs')).href);
}

function activePortalConfig(subscriptionUpdate: Record<string, unknown>) {
	return {
		id: 'bpc_launch',
		active: true,
		is_default: true,
		features: {
			invoice_history: { enabled: true },
			payment_method_update: { enabled: true },
			customer_update: { enabled: true },
			subscription_cancel: { enabled: true, mode: 'at_period_end' },
			subscription_update: subscriptionUpdate
		}
	};
}

const launchPrices = {
	team: { ok: true, id: 'price_team_499', productId: 'prod_team' },
	unit: { ok: true, id: 'price_unit_1099', productId: 'prod_unit' }
};

describe('billing launch preflight Stripe price checks', () => {
	it('fails when a launch price is recurring but not monthly', async () => {
		const { checkPrice } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPrice(results, {
			ok: true,
			label: 'Team',
			id: 'price_team_yearly',
			livemode: false,
			active: true,
			recurring: 'year',
			recurringIntervalCount: 1,
			currency: 'usd',
			unitAmount: 499,
			productId: 'prod_team'
		});

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Team Stripe price recurring',
			detail: 'price_team_yearly recurs year, expected month'
		});
	});

	it('fails when a launch price is monthly but not every month', async () => {
		const { checkPrice } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPrice(results, {
			ok: true,
			label: 'Unit',
			id: 'price_unit_quarterly',
			livemode: false,
			active: true,
			recurring: 'month',
			recurringIntervalCount: 3,
			currency: 'usd',
			unitAmount: 1099,
			productId: 'prod_unit'
		});

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Unit Stripe price interval count',
			detail: 'price_unit_quarterly interval count is 3, expected 1'
		});
	});
});

describe('billing launch preflight Customer Portal checks', () => {
	it('fails when Customer Portal plan switching is disabled', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(results, [activePortalConfig({ enabled: false })], launchPrices);

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Customer Portal plan switching',
			detail: 'disabled; enable Team/Unit plan changes before launch'
		});
	});

	it('keeps the Stripe API omitted-products case as dashboard-verification warning', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[activePortalConfig({ enabled: true, default_allowed_updates: ['price'], products: [] })],
			launchPrices
		);

		expect(results).toContainEqual({
			level: 'warn',
			label: 'Customer Portal plan switching',
			detail: 'Stripe API omitted eligible products; confirm the dashboard lists only current Team/Unit prices'
		});
		expect(results.some((item) => item.level === 'fail')).toBe(false);
	});

	it('fails when explicit portal eligibility omits the current Team or Unit price', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[
				activePortalConfig({
					enabled: true,
					default_allowed_updates: ['price'],
					products: [{ product: 'prod_team', prices: ['price_old_team'] }]
				})
			],
			launchPrices
		);

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Customer Portal plan switching',
			detail: 'enabled but missing Team/Unit product eligibility; update portal configuration before launch'
		});
	});

	it('fails when explicit portal eligibility does not allow price updates', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[
				activePortalConfig({
					enabled: true,
					default_allowed_updates: [],
					products: [
						{ product: 'prod_team', prices: ['price_team_499'] },
						{ product: 'prod_unit', prices: ['price_unit_1099'] }
					]
				})
			],
			launchPrices
		);

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Customer Portal plan switching',
			detail:
				'default_allowed_updates must include price so customers manage existing subscriptions instead of creating new ones'
		});
	});

	it('fails when omitted portal eligibility also does not allow price updates', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[activePortalConfig({ enabled: true, default_allowed_updates: [], products: [] })],
			launchPrices
		);

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Customer Portal plan switching',
			detail:
				'default_allowed_updates must include price so customers manage existing subscriptions instead of creating new ones'
		});
	});

	it('fails when Customer Portal allows quantity updates', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[
				activePortalConfig({
					enabled: true,
					default_allowed_updates: ['price', 'quantity'],
					products: [
						{ product: 'prod_team', prices: ['price_team_499'] },
						{ product: 'prod_unit', prices: ['price_unit_1099'] }
					]
				})
			],
			launchPrices
		);

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Customer Portal quantity updates',
			detail: 'default_allowed_updates includes quantity; disable customer quantity changes before launch'
		});
	});

	it('fails when an eligible portal product has adjustable quantity enabled', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[
				activePortalConfig({
					enabled: true,
					default_allowed_updates: ['price'],
					products: [
						{
							product: 'prod_team',
							prices: ['price_team_499'],
							adjustable_quantity: { enabled: true, minimum: 1, maximum: 1 }
						},
						{ product: 'prod_unit', prices: ['price_unit_1099'] }
					]
				})
			],
			launchPrices
		);

		expect(results).toContainEqual({
			level: 'fail',
			label: 'Customer Portal adjustable quantity',
			detail: 'prod_team allows customer-adjustable quantity; disable adjustable quantity before launch'
		});
	});

	it('passes when explicit portal eligibility includes current Team and Unit prices', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[
				activePortalConfig({
					enabled: true,
					default_allowed_updates: ['price'],
					products: [
						{
							product: 'prod_team',
							prices: ['price_team_499'],
							adjustable_quantity: { enabled: false }
						},
						{
							product: 'prod_unit',
							prices: ['price_unit_1099'],
							adjustable_quantity: { enabled: false }
						}
					]
				})
			],
			launchPrices
		);

		expect(results).toContainEqual({
			level: 'pass',
			label: 'Customer Portal plan switching',
			detail: 'Team and Unit prices are eligible'
		});
	});
});
