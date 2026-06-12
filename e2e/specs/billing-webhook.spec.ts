import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures/auth';
import { adminClient } from '../fixtures/supabase';

/*
 * Billing webhook E2E env findings:
 * - Signature verification calls src/lib/server/stripe.ts:getStripe(), so the
 *   billing-only Playwright config sets STRIPE_SECRET_KEY=sk_test_dummy as an
 *   obvious placeholder even though constructEvent itself is local crypto.
 * - Events are signed with STRIPE_WEBHOOK_SECRET=whsec_e2e_placeholder.
 * - PUBLIC_BILLING_ENABLED stays unset because the webhook route does not read it.
 * - This spec uses checkout.session.completed. That processing path writes through
 *   Supabase and does not call outbound Stripe helpers; subscription update gift
 *   syncing can call pause/resume, so those event types are intentionally avoided.
 * - The shared E2E config still discovers this file, so tests skip when the Stripe
 *   webhook env is absent there.
 */

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const billingWebhookEnvConfigured = Boolean(stripeSecretKey && stripeWebhookSecret);
const stripe = new Stripe(stripeSecretKey || 'sk_test_dummy');

let createdSequence = 0;

interface CheckoutCompletedPayload {
	id: string;
	type: 'checkout.session.completed';
	created: number;
	data: {
		object: {
			id: string;
			metadata: {
				orgId: string;
				tier: 'unit';
			};
			subscription: string;
			customer: string;
		};
	};
}

function uniqueStripeId(prefix: string) {
	return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}

function nextEventCreated() {
	createdSequence += 1;
	return Math.floor(Date.now() / 1000) + createdSequence;
}

function buildCheckoutCompletedPayload(orgId: string): CheckoutCompletedPayload {
	const suffix = randomUUID().replaceAll('-', '_');
	return {
		id: `evt_e2e_checkout_${suffix}`,
		type: 'checkout.session.completed',
		created: nextEventCreated(),
		data: {
			object: {
				id: `cs_e2e_${suffix}`,
				metadata: { orgId, tier: 'unit' },
				subscription: uniqueStripeId('sub_e2e'),
				customer: uniqueStripeId('cus_e2e')
			}
		}
	};
}

function stringifyPayload(payload: CheckoutCompletedPayload) {
	return JSON.stringify(payload);
}

function signPayload(payload: string, secret = stripeWebhookSecret) {
	return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

async function readWebhookEventRows(eventId: string) {
	const { data, error, count } = await adminClient
		.from('stripe_webhook_events')
		.select('id, type, object_id, processing_state, processed, attempt_count, processing_result', { count: 'exact' })
		.eq('id', eventId);

	expect(error).toBeNull();
	return { rows: data ?? [], count: count ?? 0 };
}

test.describe('Stripe billing webhook ingestion', () => {
	test.skip(!billingWebhookEnvConfigured, 'billing webhook env is configured only by e2e/playwright.billing.config.ts');

	test('rejects an unsigned POST', async ({ request, orgId }) => {
		const response = await request.post('/api/webhooks/stripe', {
			data: stringifyPayload(buildCheckoutCompletedPayload(orgId)),
			headers: { 'content-type': 'application/json' }
		});

		expect(response.status()).toBe(400);
	});

	test('rejects a wrongly-signed POST', async ({ request, orgId }) => {
		const payload = stringifyPayload(buildCheckoutCompletedPayload(orgId));
		const response = await request.post('/api/webhooks/stripe', {
			data: payload,
			headers: {
				'content-type': 'application/json',
				'stripe-signature': signPayload(payload, 'whsec_wrong_placeholder')
			}
		});

		expect(response.status()).toBe(400);
	});

	test('accepts and records a correctly-signed event', async ({ request, orgId }) => {
		const event = buildCheckoutCompletedPayload(orgId);
		const payload = stringifyPayload(event);
		const response = await request.post('/api/webhooks/stripe', {
			data: payload,
			headers: {
				'content-type': 'application/json',
				'stripe-signature': signPayload(payload)
			}
		});

		expect(response.ok()).toBe(true);
		const { rows, count } = await readWebhookEventRows(event.id);
		expect(count).toBe(1);
		expect(rows[0]).toMatchObject({
			id: event.id,
			type: event.type,
			object_id: event.data.object.id,
			processing_state: 'processed',
			processed: true,
			attempt_count: 1
		});
	});

	test('replay is idempotent', async ({ request, orgId }) => {
		const event = buildCheckoutCompletedPayload(orgId);
		const payload = stringifyPayload(event);
		const signature = signPayload(payload);
		const headers = {
			'content-type': 'application/json',
			'stripe-signature': signature
		};

		const firstResponse = await request.post('/api/webhooks/stripe', { data: payload, headers });
		expect(firstResponse.ok()).toBe(true);
		const firstRead = await readWebhookEventRows(event.id);
		expect(firstRead.count).toBe(1);
		expect(firstRead.rows[0]).toMatchObject({ processing_state: 'processed', attempt_count: 1 });

		const replayResponse = await request.post('/api/webhooks/stripe', { data: payload, headers });
		expect(replayResponse.ok()).toBe(true);
		await expect(replayResponse.text()).resolves.toBe('Already processed');

		const replayRead = await readWebhookEventRows(event.id);
		expect(replayRead.count).toBe(1);
		expect(replayRead.rows[0]).toMatchObject({ processing_state: 'processed', attempt_count: 1 });
	});
});
