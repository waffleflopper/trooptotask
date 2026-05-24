#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import Stripe from 'stripe';

const SUCCESS_CARD_TOKEN = 'tok_visa';
const FAILING_CARD_TOKEN = 'tok_chargeCustomerFail';
const DELIVERY_TIMEOUT_MS = 15_000;

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

function parseArgs(argv) {
	const args = { command: argv[0], options: {} };
	for (let i = 1; i < argv.length; i += 1) {
		const value = argv[i];
		if (!value.startsWith('--')) continue;
		const key = value.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith('--')) {
			args.options[key] = true;
			continue;
		}
		args.options[key] = next;
		i += 1;
	}
	return args;
}

function usage() {
	console.log(`Billing lifecycle simulator

Usage:
  npm run billing:lifecycle -- create-fixture --org-id <uuid> --tier team|unit --email <test@example.com> [--name "Org Name"] [--failing-payment]
  npm run billing:lifecycle -- advance-clock --clock-id <clock_id> --days <number>
  npm run billing:lifecycle -- switch-plan --subscription-id <sub_id> --tier team|unit
  npm run billing:lifecycle -- set-payment-method --subscription-id <sub_id> --mode success|failing
  npm run billing:lifecycle -- deliver-events --org-id <uuid> [--subscription-id <sub_id>] [--since <unix_seconds>] [--app-url http://localhost:5173]
  npm run billing:lifecycle -- cancel-at-period-end --subscription-id <sub_id>
  npm run billing:lifecycle -- cancel-now --subscription-id <sub_id>
  npm run billing:lifecycle -- finish-clock --clock-id <clock_id>

	All commands refuse to run unless STRIPE_SECRET_KEY is a test key. Output is support-safe and omits secrets.`);
}

function requireOption(options, key) {
	const value = options[key];
	if (!value || value === true) throw new Error(`Missing --${key}`);
	return value;
}

function assertTestKey(env) {
	if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
		throw new Error('Refusing to run lifecycle simulation because STRIPE_SECRET_KEY is not a test key.');
	}
}

function priceForTier(env, tier) {
	if (tier === 'team') return env.STRIPE_TEAM_PRICE_ID;
	if (tier === 'unit') return env.STRIPE_UNIT_PRICE_ID;
	throw new Error('--tier must be team or unit');
}

async function attachDefaultPaymentMethod(stripe, customerId, cardToken) {
	const paymentMethod = await stripe.paymentMethods.create({
		type: 'card',
		card: { token: cardToken }
	});
	await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });
	await stripe.customers.update(customerId, {
		invoice_settings: { default_payment_method: paymentMethod.id }
	});
	return paymentMethod.id;
}

async function createFixture(stripe, env, options) {
	const orgId = requireOption(options, 'org-id');
	const tier = requireOption(options, 'tier');
	const email = requireOption(options, 'email');
	const orgName = options.name && options.name !== true ? options.name : `Billing launch ${orgId}`;
	const priceId = priceForTier(env, tier);
	if (!priceId) throw new Error(`No Stripe price ID configured for tier ${tier}`);

	const frozenTime = Math.floor(Date.now() / 1000);
	const clock = await stripe.testHelpers.testClocks.create({
		frozen_time: frozenTime,
		name: `TroopToTask billing launch ${orgId}`
	});
	const customer = await stripe.customers.create({
		email,
		name: orgName,
		test_clock: clock.id,
		metadata: { orgId, orgName }
	});
	await attachDefaultPaymentMethod(
		stripe,
		customer.id,
		options['failing-payment'] ? FAILING_CARD_TOKEN : SUCCESS_CARD_TOKEN
	);
	const subscription = await stripe.subscriptions.create({
		customer: customer.id,
		items: [{ price: priceId }],
		metadata: { orgId, tier },
		payment_behavior: 'error_if_incomplete'
	});

	return {
		clockId: clock.id,
		customerId: customer.id,
		subscriptionId: subscription.id,
		initialStatus: subscription.status,
		tier,
		priceId
	};
}

async function advanceClock(stripe, options) {
	const clockId = requireOption(options, 'clock-id');
	const days = Number(requireOption(options, 'days'));
	if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');
	const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
	const frozenTime = clock.frozen_time;
	const advancesTo = frozenTime + Math.floor(days * 24 * 60 * 60);
	const advanced = await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: advancesTo });
	return { clockId: advanced.id, status: advanced.status, frozenTime: advanced.frozen_time };
}

async function switchPlan(stripe, env, options) {
	const subscriptionId = requireOption(options, 'subscription-id');
	const tier = requireOption(options, 'tier');
	const priceId = priceForTier(env, tier);
	if (!priceId) throw new Error(`No Stripe price ID configured for tier ${tier}`);
	const subscription = await stripe.subscriptions.retrieve(subscriptionId);
	const itemId = subscription.items.data[0]?.id;
	if (!itemId) throw new Error(`Subscription ${subscriptionId} has no subscription item to update`);
	const updated = await stripe.subscriptions.update(subscriptionId, {
		items: [{ id: itemId, price: priceId }],
		metadata: { ...subscription.metadata, tier },
		proration_behavior: 'always_invoice'
	});
	return { subscriptionId: updated.id, status: updated.status, tier, priceId };
}

async function setPaymentMethod(stripe, options) {
	const subscriptionId = requireOption(options, 'subscription-id');
	const mode = requireOption(options, 'mode');
	if (mode !== 'success' && mode !== 'failing') throw new Error('--mode must be success or failing');
	const subscription = await stripe.subscriptions.retrieve(subscriptionId);
	const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
	if (!customerId) throw new Error(`Subscription ${subscriptionId} has no customer ID`);
	await attachDefaultPaymentMethod(stripe, customerId, mode === 'success' ? SUCCESS_CARD_TOKEN : FAILING_CARD_TOKEN);
	return { subscriptionId, customerId, mode };
}

function getEventObject(event) {
	return event?.data?.object ?? {};
}

function eventMatches(input) {
	const object = getEventObject(input.event);
	const metadata = object.metadata ?? {};
	const subscriptionId = object.id?.startsWith?.('sub_')
		? object.id
		: (object.subscription ?? object.parent?.subscription_details?.subscription);
	const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;

	if (input.orgId && metadata.orgId === input.orgId) return true;
	if (input.subscriptionId && subscriptionId === input.subscriptionId) return true;
	if (input.customerId && customerId === input.customerId) return true;
	return false;
}

async function signStripePayload(payload, secret) {
	const crypto = await import('node:crypto');
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
	return `t=${timestamp},v1=${signature}`;
}

async function deliverEvents(stripe, env, options) {
	const orgId = options['org-id'] && options['org-id'] !== true ? options['org-id'] : null;
	const subscriptionId =
		options['subscription-id'] && options['subscription-id'] !== true ? options['subscription-id'] : null;
	if (!orgId && !subscriptionId) throw new Error('Provide --org-id, --subscription-id, or both');
	if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new Error('STRIPE_WEBHOOK_SECRET is missing or invalid');

	const appUrl = options['app-url'] && options['app-url'] !== true ? options['app-url'] : 'http://localhost:5173';
	const since = options.since && options.since !== true ? Number(options.since) : Math.floor(Date.now() / 1000) - 3600;
	if (!Number.isFinite(since) || since <= 0) throw new Error('--since must be a unix timestamp in seconds');

	const events = [];
	for await (const event of stripe.events.list({ created: { gte: since }, limit: 100 })) {
		if (eventMatches({ event, orgId, subscriptionId })) events.push(event);
	}
	events.sort((left, right) => left.created - right.created || left.id.localeCompare(right.id));

	const delivered = [];
	for (const event of events) {
		const payload = JSON.stringify(event);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
		const response = await fetch(`${appUrl.replace(/\/$/, '')}/api/webhooks/stripe`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'stripe-signature': await signStripePayload(payload, env.STRIPE_WEBHOOK_SECRET)
			},
			body: payload,
			signal: controller.signal
		}).finally(() => clearTimeout(timeout));
		delivered.push({
			id: event.id,
			type: event.type,
			created: event.created,
			status: response.status,
			body: await response.text()
		});
	}

	return { matched: events.length, delivered };
}

async function cancelAtPeriodEnd(stripe, options) {
	const subscriptionId = requireOption(options, 'subscription-id');
	const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
	return {
		subscriptionId: updated.id,
		status: updated.status,
		cancelAtPeriodEnd: updated.cancel_at_period_end
	};
}

async function cancelNow(stripe, options) {
	const subscriptionId = requireOption(options, 'subscription-id');
	const deleted = await stripe.subscriptions.cancel(subscriptionId);
	return { subscriptionId: deleted.id, status: deleted.status };
}

async function finishClock(stripe, options) {
	const clockId = requireOption(options, 'clock-id');
	const clock = await stripe.testHelpers.testClocks.del(clockId);
	return { clockId: clock.id, deleted: clock.deleted };
}

async function main() {
	const { command, options } = parseArgs(process.argv.slice(2));
	if (!command || command === 'help' || command === '--help') {
		usage();
		return;
	}

	const env = loadEnv();
	assertTestKey(env);
	const stripe = new Stripe(env.STRIPE_SECRET_KEY);
	let output;
	switch (command) {
		case 'create-fixture':
			output = await createFixture(stripe, env, options);
			break;
		case 'advance-clock':
			output = await advanceClock(stripe, options);
			break;
		case 'switch-plan':
			output = await switchPlan(stripe, env, options);
			break;
		case 'set-payment-method':
			output = await setPaymentMethod(stripe, options);
			break;
		case 'deliver-events':
			output = await deliverEvents(stripe, env, options);
			break;
		case 'cancel-at-period-end':
			output = await cancelAtPeriodEnd(stripe, options);
			break;
		case 'cancel-now':
			output = await cancelNow(stripe, options);
			break;
		case 'finish-clock':
			output = await finishClock(stripe, options);
			break;
		default:
			throw new Error(`Unknown command: ${command}`);
	}

	console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
