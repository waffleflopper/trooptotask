import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import { TIER_CONFIG } from '$lib/types/subscription';

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

	const priceId = TIER_CONFIG[options.tier].stripePriceId;
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

export async function createPortalSession(
	customerId: string,
	returnUrl: string
): Promise<string> {
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

export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
	const stripe = getStripe();
	return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}
