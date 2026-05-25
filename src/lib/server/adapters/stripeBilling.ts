/**
 * BillingPort implementation backed by Stripe.
 * Thin adapter around `src/lib/server/stripe.ts` for use in UseCaseContext.
 * Handles checkout sessions, customer portal redirects, and subscription lifecycle
 * (cancel, pause, resume). Only active when PUBLIC_BILLING_ENABLED is set.
 */
import type { BillingPort } from '$lib/server/core/ports';
import {
	createCheckoutSession,
	createPortalSession,
	expireCheckoutSession,
	cancelSubscription,
	pauseSubscription,
	resumeSubscription
} from '$lib/server/stripe';

export function createStripeBillingAdapter(): BillingPort {
	return {
		async createCheckoutSession(options) {
			return createCheckoutSession(options);
		},
		async createPortalSession(customerId, returnUrl) {
			const url = await createPortalSession(customerId, returnUrl);
			return { url };
		},
		async expireCheckoutSession(sessionId) {
			return expireCheckoutSession(sessionId);
		},
		async cancelSubscription(subscriptionId, options) {
			return cancelSubscription(subscriptionId, options);
		},
		async pauseSubscription(subscriptionId) {
			return pauseSubscription(subscriptionId);
		},
		async resumeSubscription(subscriptionId) {
			return resumeSubscription(subscriptionId);
		}
	};
}
