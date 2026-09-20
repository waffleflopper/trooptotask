#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';

const HANDLED_WEBHOOK_EVENTS = new Set([
	'checkout.session.completed',
	'customer.subscription.updated',
	'customer.subscription.deleted',
	'invoice.payment_failed',
	'invoice.payment_succeeded',
	'invoice.paid'
]);

const OPTIONAL_STRIPE_EVENTS = new Set(['customer.subscription.created']);

const EXPECTED_PRICE_CONTRACT = {
	Team: { unitAmount: 499, currency: 'usd', interval: 'month', intervalCount: 1 },
	Unit: { unitAmount: 1099, currency: 'usd', interval: 'month', intervalCount: 1 }
};

function parseArgs(argv) {
	return {
		json: argv.includes('--json'),
		offline: argv.includes('--offline')
	};
}

function parseEnvFile(path) {
	if (!existsSync(path)) return {};
	const env = {};
	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
		if (!match || line.trimStart().startsWith('#')) continue;
		const [, key, rawValue] = match;
		env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
	}
	return env;
}

function loadEnv() {
	return {
		...parseEnvFile('.env'),
		...parseEnvFile('.env.local'),
		...process.env
	};
}

function result(level, label, detail) {
	return { level, label, detail };
}

function assertEnv(results, env) {
	const required = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_TEAM_PRICE_ID', 'STRIPE_UNIT_PRICE_ID'];
	for (const key of required) {
		results.push(
			env[key] ? result('pass', `${key} configured`, 'present') : result('fail', `${key} configured`, 'missing')
		);
	}

	results.push(
		env.PUBLIC_BILLING_ENABLED === 'true'
			? result('pass', 'PUBLIC_BILLING_ENABLED', 'true')
			: result('warn', 'PUBLIC_BILLING_ENABLED', 'not true for local checkout testing')
	);

	results.push(
		env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
			? result('pass', 'Stripe secret mode', 'test key')
			: result('fail', 'Stripe secret mode', 'missing or not a test key')
	);

	results.push(
		env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')
			? result('pass', 'Stripe webhook secret shape', 'looks like a webhook signing secret')
			: result('fail', 'Stripe webhook secret shape', 'missing or unexpected shape')
	);

	const automaticTaxEnabled = env.STRIPE_AUTOMATIC_TAX_ENABLED === 'true';
	const taxDashboardVerified = env.STRIPE_TAX_DASHBOARD_VERIFIED === 'true';
	results.push(
		automaticTaxEnabled
			? result('warn', 'Stripe automatic tax app flag', 'enabled; requires dashboard verification evidence')
			: result('pass', 'Stripe automatic tax app flag', 'disabled')
	);
	results.push(
		automaticTaxEnabled
			? taxDashboardVerified
				? result('pass', 'Stripe Tax dashboard verification flag', 'marked verified')
				: result('fail', 'Stripe Tax dashboard verification flag', 'required when automatic tax is enabled')
			: taxDashboardVerified
				? result('warn', 'Stripe Tax dashboard verification flag', 'marked verified but automatic tax is disabled')
				: result('pass', 'Stripe Tax dashboard verification flag', 'not required while automatic tax is disabled')
	);
}

async function retrievePrice(stripe, priceId, label) {
	try {
		const price = await stripe.prices.retrieve(priceId);
		return {
			ok: true,
			label,
			id: price.id,
			livemode: price.livemode,
			active: price.active,
			recurring: price.recurring?.interval ?? null,
			recurringIntervalCount: price.recurring?.interval_count ?? null,
			currency: price.currency,
			unitAmount: price.unit_amount,
			productId: typeof price.product === 'string' ? price.product : price.product?.id
		};
	} catch (err) {
		return {
			ok: false,
			label,
			id: priceId,
			error: err instanceof Error ? err.message : 'unknown Stripe price lookup error'
		};
	}
}

async function listAllStripeRows(listCall) {
	const rows = [];
	for await (const row of listCall()) {
		rows.push(row);
	}
	return rows;
}

function formatCents(cents) {
	return typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}` : 'missing amount';
}

function checkPrice(results, price) {
	if (!price.ok) {
		results.push(result('fail', `${price.label} Stripe price`, price.error));
		return;
	}
	const expected = EXPECTED_PRICE_CONTRACT[price.label];
	results.push(
		price.livemode === false
			? result('pass', `${price.label} Stripe price mode`, 'test mode')
			: result('fail', `${price.label} Stripe price mode`, `${price.id} is not a test-mode price`)
	);
	results.push(
		price.active
			? result('pass', `${price.label} Stripe price active`, `${price.id} (${price.currency})`)
			: result('fail', `${price.label} Stripe price active`, `${price.id} is inactive`)
	);
	results.push(
		price.recurring === expected.interval
			? result('pass', `${price.label} Stripe price recurring`, expected.interval)
			: result(
					'fail',
					`${price.label} Stripe price recurring`,
					price.recurring
						? `${price.id} recurs ${price.recurring}, expected ${expected.interval}`
						: 'not a recurring price'
				)
	);
	results.push(
		price.recurringIntervalCount === expected.intervalCount
			? result('pass', `${price.label} Stripe price interval count`, String(expected.intervalCount))
			: result(
					'fail',
					`${price.label} Stripe price interval count`,
					price.recurringIntervalCount
						? `${price.id} interval count is ${price.recurringIntervalCount}, expected ${expected.intervalCount}`
						: 'missing recurring interval count'
				)
	);
	results.push(
		price.unitAmount === expected.unitAmount
			? result('pass', `${price.label} Stripe price amount`, `${price.id} is ${formatCents(price.unitAmount)}`)
			: result(
					'fail',
					`${price.label} Stripe price amount`,
					`${price.id} is ${formatCents(price.unitAmount)}, expected ${formatCents(expected.unitAmount)}`
				)
	);
	results.push(
		price.currency === expected.currency
			? result('pass', `${price.label} Stripe price currency`, expected.currency)
			: result(
					'fail',
					`${price.label} Stripe price currency`,
					`${price.id} is ${price.currency ?? 'missing currency'}, expected ${expected.currency}`
				)
	);
}

function checkPortalConfiguration(results, configurations, prices) {
	const activeDefault =
		configurations.find((config) => config.active && config.is_default) ??
		configurations.find((config) => config.active);
	if (!activeDefault) {
		results.push(result('fail', 'Customer Portal configuration', 'no active test-mode portal configuration found'));
		return;
	}

	results.push(result('pass', 'Customer Portal configuration', `${activeDefault.id} is active`));
	const features = activeDefault.features ?? {};
	const requiredFeatures = [
		['invoice_history', 'Invoice history'],
		['payment_method_update', 'Payment method update'],
		['customer_update', 'Customer information update'],
		['subscription_cancel', 'Subscription cancellation']
	];

	for (const [key, label] of requiredFeatures) {
		results.push(
			features[key]?.enabled
				? result('pass', `Customer Portal ${label}`, 'enabled')
				: result('fail', `Customer Portal ${label}`, 'disabled')
		);
	}

	const cancelMode = features.subscription_cancel?.mode;
	results.push(
		cancelMode === 'at_period_end'
			? result('pass', 'Customer Portal cancellation mode', 'at_period_end')
			: result('warn', 'Customer Portal cancellation mode', cancelMode ?? 'not configured')
	);

	const update = features.subscription_update;
	const updateProductEntries = update?.products ?? [];
	const allowedUpdates = new Set(update?.default_allowed_updates ?? []);
	const updateProducts = new Map(updateProductEntries.map((item) => [item.product, new Set(item.prices ?? [])]));
	const teamConfigured = prices.team.ok && updateProducts.get(prices.team.productId)?.has(prices.team.id);
	const unitConfigured = prices.unit.ok && updateProducts.get(prices.unit.productId)?.has(prices.unit.id);
	const adjustableQuantityProducts = updateProductEntries.filter((item) => {
		const adjustableQuantity = item.adjustable_quantity;
		return adjustableQuantity?.enabled === true;
	});
	if (!update?.enabled) {
		results.push(
			result('fail', 'Customer Portal plan switching', 'disabled; enable Team/Unit plan changes before launch')
		);
		return;
	}

	if (allowedUpdates.has('quantity')) {
		results.push(
			result(
				'fail',
				'Customer Portal quantity updates',
				'default_allowed_updates includes quantity; disable customer quantity changes before launch'
			)
		);
	}

	if (!allowedUpdates.has('price')) {
		results.push(
			result(
				'fail',
				'Customer Portal plan switching',
				'default_allowed_updates must include price so customers manage existing subscriptions instead of creating new ones'
			)
		);
	}

	if (updateProductEntries.length === 0) {
		results.push(
			result(
				'warn',
				'Customer Portal plan switching',
				'Stripe API omitted eligible products; confirm the dashboard lists only current Team/Unit prices'
			)
		);
	} else {
		if (!teamConfigured || !unitConfigured) {
			results.push(
				result(
					'fail',
					'Customer Portal plan switching',
					'enabled but missing Team/Unit product eligibility; update portal configuration before launch'
				)
			);
		} else if (adjustableQuantityProducts.length > 0) {
			results.push(
				result(
					'fail',
					'Customer Portal adjustable quantity',
					`${adjustableQuantityProducts.map((item) => item.product).join(', ')} allows customer-adjustable quantity; disable adjustable quantity before launch`
				)
			);
		} else if (!allowedUpdates.has('quantity')) {
			results.push(result('pass', 'Customer Portal plan switching', 'Team and Unit prices are eligible'));
		}
	}
}

function checkWebhookEndpoints(results, endpoints) {
	const billingEndpoints = endpoints.filter(
		(endpoint) => endpoint.status === 'enabled' && endpoint.url.includes('/api/webhooks/stripe')
	);
	if (billingEndpoints.length === 0) {
		results.push(result('fail', 'Stripe webhook endpoint', 'no enabled /api/webhooks/stripe endpoint found'));
		return;
	}

	for (const endpoint of billingEndpoints) {
		const enabled = new Set(endpoint.enabled_events ?? []);
		const missing = [...HANDLED_WEBHOOK_EVENTS].filter((event) => !enabled.has(event) && !enabled.has('*'));
		const unsupported = [...enabled].filter(
			(event) => event !== '*' && !HANDLED_WEBHOOK_EVENTS.has(event) && !OPTIONAL_STRIPE_EVENTS.has(event)
		);
		const optionalNoise = [...enabled].filter((event) => OPTIONAL_STRIPE_EVENTS.has(event));

		results.push(
			missing.length === 0
				? result('pass', 'Stripe webhook handled events', `${endpoint.id} includes all handled events`)
				: result('fail', 'Stripe webhook handled events', `${endpoint.id} missing ${missing.join(', ')}`)
		);

		if (optionalNoise.length) {
			results.push(
				result(
					'warn',
					'Stripe webhook optional ignored events',
					`${endpoint.id} also sends ${optionalNoise.join(', ')}; TroopToTask records these as ignored`
				)
			);
		}

		if (unsupported.length) {
			results.push(
				result(
					'warn',
					'Stripe webhook unsupported events',
					`${endpoint.id} sends ${unsupported.join(', ')}; confirm they should remain ignored`
				)
			);
		}
	}
}

function printResults(results, json) {
	const summary = {
		pass: results.filter((item) => item.level === 'pass').length,
		warn: results.filter((item) => item.level === 'warn').length,
		fail: results.filter((item) => item.level === 'fail').length
	};

	if (json) {
		console.log(JSON.stringify({ summary, results }, null, 2));
		return;
	}

	console.log('Billing launch preflight');
	for (const item of results) {
		const marker = item.level === 'pass' ? 'PASS' : item.level === 'warn' ? 'WARN' : 'FAIL';
		console.log(`${marker} ${item.label}: ${item.detail}`);
	}
	console.log(`\nSummary: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const env = loadEnv();
	const results = [];
	assertEnv(results, env);

	if (!args.offline && env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
		const stripe = new Stripe(env.STRIPE_SECRET_KEY);
		const [team, unit, configurations, endpoints] = await Promise.all([
			retrievePrice(stripe, env.STRIPE_TEAM_PRICE_ID, 'Team'),
			retrievePrice(stripe, env.STRIPE_UNIT_PRICE_ID, 'Unit'),
			listAllStripeRows(() => stripe.billingPortal.configurations.list({ limit: 100 })),
			listAllStripeRows(() => stripe.webhookEndpoints.list({ limit: 100 }))
		]);

		checkPrice(results, team);
		checkPrice(results, unit);
		checkPortalConfiguration(results, configurations, { team, unit });
		checkWebhookEndpoints(results, endpoints);
	}

	printResults(results, args.json);
	if (results.some((item) => item.level === 'fail')) process.exitCode = 1;
}

export { checkPortalConfiguration, checkPrice };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 1;
	});
}
