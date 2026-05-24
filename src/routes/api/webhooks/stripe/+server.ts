import type { RequestHandler } from './$types';
import { handleStripeWebhookPost } from '$lib/server/billing/stripeWebhookProcessing';

export const POST: RequestHandler = async ({ request }) => handleStripeWebhookPost(request);
