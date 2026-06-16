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

		checkPortalConfiguration(results, [activePortalConfig({ enabled: true, products: [] })], launchPrices);

		expect(results).toContainEqual({
			level: 'warn',
			label: 'Customer Portal plan switching',
			detail: 'Stripe API omitted eligible products; confirm the dashboard lists only current Team/Unit prices'
		});
	});

	it('fails when explicit portal eligibility omits the current Team or Unit price', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[
				activePortalConfig({
					enabled: true,
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

	it('passes when explicit portal eligibility includes current Team and Unit prices', async () => {
		const { checkPortalConfiguration } = await loadPreflightModule();
		const results: PreflightResult[] = [];

		checkPortalConfiguration(
			results,
			[
				activePortalConfig({
					enabled: true,
					products: [
						{ product: 'prod_team', prices: ['price_team_499'] },
						{ product: 'prod_unit', prices: ['price_unit_1099'] }
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
