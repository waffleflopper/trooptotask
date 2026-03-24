import type { BillingPort } from '$lib/server/core/ports';
import {
	createCheckoutSession,
	createPortalSession,
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
		async cancelSubscription(subscriptionId) {
			return cancelSubscription(subscriptionId);
		},
		async pauseSubscription(subscriptionId) {
			return pauseSubscription(subscriptionId);
		},
		async resumeSubscription(subscriptionId) {
			return resumeSubscription(subscriptionId);
		}
	};
}
