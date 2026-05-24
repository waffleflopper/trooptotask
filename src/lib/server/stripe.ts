import Stripe from 'stripe';
import {
	STRIPE_SECRET_KEY,
	STRIPE_WEBHOOK_SECRET,
	STRIPE_TEAM_PRICE_ID,
	STRIPE_UNIT_PRICE_ID
} from '$env/static/private';
import type { BillingReconciliationProviderSubscription } from '$lib/server/core/useCases/billingReconciliation';

function getStripe(): Stripe {
	if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
	return new Stripe(STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(options: {
	orgId: string;
	orgName: string;
	tier: 'team' | 'unit';
	customerEmail: string;
	existingCustomerId?: string;
	successUrl: string;
	cancelUrl: string;
}): Promise<{ url: string; customerId: string }> {
	const stripe = getStripe();

	const PRICE_IDS: Record<string, string | undefined> = {
		team: STRIPE_TEAM_PRICE_ID,
		unit: STRIPE_UNIT_PRICE_ID
	};
	const priceId = PRICE_IDS[options.tier];
	if (!priceId) throw new Error(`No Stripe price ID configured for tier: ${options.tier}`);

	let customerId = options.existingCustomerId;
	if (!customerId) {
		const customer = await stripe.customers.create({
			email: options.customerEmail,
			metadata: { orgId: options.orgId, orgName: options.orgName }
		});
		customerId = customer.id;
	}

	const session = await stripe.checkout.sessions.create({
		customer: customerId,
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: options.successUrl,
		cancel_url: options.cancelUrl,
		metadata: { orgId: options.orgId, tier: options.tier },
		subscription_data: {
			metadata: { orgId: options.orgId, tier: options.tier }
		}
	});

	if (!session.url) throw new Error('Stripe checkout session URL is null');
	return { url: session.url, customerId };
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
	const stripe = getStripe();
	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl
	});
	return session.url;
}

export async function pauseSubscription(subscriptionId: string): Promise<void> {
	const stripe = getStripe();
	await stripe.subscriptions.update(subscriptionId, {
		pause_collection: { behavior: 'void' }
	});
}

export async function resumeSubscription(subscriptionId: string): Promise<void> {
	const stripe = getStripe();
	await stripe.subscriptions.update(subscriptionId, {
		pause_collection: ''
	});
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
	const stripe = getStripe();
	await stripe.subscriptions.cancel(subscriptionId);
}

function isoFromStripeTimestamp(value: number | null | undefined): string | null {
	return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

function mapProviderSubscription(subscription: Stripe.Subscription): BillingReconciliationProviderSubscription {
	const raw = subscription as unknown as {
		current_period_start?: number;
		current_period_end?: number;
		items?: {
			data?: Array<{
				current_period_start?: number;
				current_period_end?: number;
			}>;
		};
	};
	const price = subscription.items?.data?.[0]?.price;
	const firstItem = raw.items?.data?.[0];
	const product = price?.product;
	const customer = subscription.customer;

	return {
		id: subscription.id,
		customerId: typeof customer === 'string' ? customer : (customer?.id ?? null),
		status: subscription.status as BillingReconciliationProviderSubscription['status'],
		priceId: price?.id ?? null,
		productId: typeof product === 'string' ? product : (product?.id ?? null),
		currentPeriodStart: isoFromStripeTimestamp(raw.current_period_start ?? firstItem?.current_period_start),
		currentPeriodEnd: isoFromStripeTimestamp(raw.current_period_end ?? firstItem?.current_period_end),
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		canceledAt: isoFromStripeTimestamp(subscription.canceled_at),
		trialEnd: isoFromStripeTimestamp(subscription.trial_end),
		metadata: subscription.metadata ?? {}
	};
}

export function createStripeBillingReconciliationProvider() {
	const stripe = getStripe();
	return {
		async retrieveSubscription(subscriptionId: string): Promise<BillingReconciliationProviderSubscription | null> {
			try {
				const subscription = await stripe.subscriptions.retrieve(subscriptionId);
				return mapProviderSubscription(subscription);
			} catch (err) {
				if (err instanceof Stripe.errors.StripeInvalidRequestError && err.statusCode === 404) return null;
				throw err;
			}
		},

		async listSubscriptionsForCustomer(customerId: string): Promise<BillingReconciliationProviderSubscription[]> {
			const subscriptions: Stripe.Subscription[] = [];
			let startingAfter: string | undefined;

			do {
				const page = await stripe.subscriptions.list({
					customer: customerId,
					status: 'all',
					limit: 100,
					...(startingAfter ? { starting_after: startingAfter } : {})
				});
				subscriptions.push(...page.data);
				startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
			} while (startingAfter);

			return subscriptions.map(mapProviderSubscription);
		}
	};
}

export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
	const stripe = getStripe();
	return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}
