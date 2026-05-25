import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import type { CheckoutSessionConfiguration } from '$lib/server/billing/checkoutConfiguration';
import type { BillingReconciliationProviderSubscription } from '$lib/server/core/useCases/billingReconciliation';

function getStripe(): Stripe {
	if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
	return new Stripe(STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(options: {
	orgId: string;
	orgName: string;
	tier: 'team' | 'unit';
	priceId: string;
	checkoutAttemptId?: string;
	customerEmail: string;
	existingCustomerId?: string;
	successUrl: string;
	cancelUrl: string;
	checkoutConfiguration: CheckoutSessionConfiguration;
}): Promise<{ url: string; customerId: string; sessionId: string; expiresAt: string | null }> {
	const stripe = getStripe();

	if (!options.priceId) throw new Error(`No Stripe price ID configured for tier: ${options.tier}`);
	const price = await stripe.prices.retrieve(options.priceId);
	validateCheckoutPriceForSecretMode(price, STRIPE_SECRET_KEY);

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
		client_reference_id: options.orgId,
		line_items: [{ price: price.id, quantity: 1 }],
		success_url: options.successUrl,
		cancel_url: options.cancelUrl,
		billing_address_collection: options.checkoutConfiguration.billingAddressCollection,
		automatic_tax: options.checkoutConfiguration.automaticTax,
		customer_update: options.checkoutConfiguration.customerUpdate,
		metadata: {
			orgId: options.orgId,
			tier: options.tier,
			commercialPlan: options.tier,
			priceId: price.id,
			...(options.checkoutAttemptId ? { checkoutAttemptId: options.checkoutAttemptId } : {})
		},
		subscription_data: {
			metadata: {
				orgId: options.orgId,
				tier: options.tier,
				commercialPlan: options.tier,
				priceId: price.id,
				...(options.checkoutAttemptId ? { checkoutAttemptId: options.checkoutAttemptId } : {})
			}
		}
	});

	if (!session.url) throw new Error('Stripe checkout session URL is null');
	return { url: session.url, customerId, sessionId: session.id, expiresAt: isoFromStripeTimestamp(session.expires_at) };
}

type StripeMode = 'test' | 'live' | 'unknown';

function stripeModeFromSecretKey(secretKey: string | undefined): StripeMode {
	if (secretKey?.startsWith('sk_test_') || secretKey?.startsWith('rk_test_')) return 'test';
	if (secretKey?.startsWith('sk_live_') || secretKey?.startsWith('rk_live_')) return 'live';
	return 'unknown';
}

export function validateCheckoutPriceForSecretMode(
	price: Pick<Stripe.Price, 'id' | 'livemode' | 'active' | 'recurring'>,
	secretKey: string | undefined
): void {
	const mode = stripeModeFromSecretKey(secretKey);
	if (mode === 'unknown') {
		throw new Error('Stripe secret key mode could not be determined for checkout price validation');
	}
	if (mode === 'test' && price.livemode) {
		throw new Error(
			`Configured checkout price ${price.id} belongs to live mode but the Stripe secret key is test mode`
		);
	}
	if (mode === 'live' && !price.livemode) {
		throw new Error(
			`Configured checkout price ${price.id} belongs to test mode but the Stripe secret key is live mode`
		);
	}
	if (!price.active) {
		throw new Error(`Configured checkout price ${price.id} is not active`);
	}
	if (!price.recurring) {
		throw new Error(`Configured checkout price ${price.id} must be a recurring price`);
	}
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
	const stripe = getStripe();
	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl
	});
	return session.url;
}

export async function expireCheckoutSession(sessionId: string): Promise<void> {
	const stripe = getStripe();
	await stripe.checkout.sessions.expire(sessionId);
}

export interface CheckoutSessionRecoveryDetails {
	id: string;
	status: Stripe.Checkout.Session['status'] | null;
	paymentStatus: Stripe.Checkout.Session['payment_status'] | null;
	customerId: string | null;
	subscriptionId: string | null;
	metadata: Stripe.Metadata | null;
}

export async function retrieveCheckoutSessionForRecovery(sessionId: string): Promise<CheckoutSessionRecoveryDetails> {
	const stripe = getStripe();
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	return {
		id: session.id,
		status: session.status,
		paymentStatus: session.payment_status,
		customerId: typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null),
		subscriptionId:
			typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null),
		metadata: session.metadata ?? null
	};
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

export async function cancelSubscription(
	subscriptionId: string,
	options: { cancellationFeedback?: Stripe.SubscriptionCancelParams.CancellationDetails.Feedback | null } = {}
): Promise<void> {
	const stripe = getStripe();
	await stripe.subscriptions.cancel(
		subscriptionId,
		options.cancellationFeedback ? { cancellation_details: { feedback: options.cancellationFeedback } } : undefined
	);
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
