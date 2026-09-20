import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import type { Tier } from '$lib/types/subscription';

function getStripe(): Stripe {
	if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
	return new Stripe(STRIPE_SECRET_KEY);
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

export async function updateSubscriptionPlanMetadata(
	subscriptionId: string,
	metadata: { tier: Exclude<Tier, 'free'>; priceId: string }
): Promise<void> {
	const stripe = getStripe();
	await stripe.subscriptions.update(subscriptionId, {
		metadata: {
			tier: metadata.tier,
			commercialPlan: metadata.tier,
			priceId: metadata.priceId
		}
	});
}

export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
	const stripe = getStripe();
	return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}
