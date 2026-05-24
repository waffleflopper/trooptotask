import type { AdminRole } from '$lib/server/admin';
import type { BillingSnapshot } from '$lib/types/subscription';

export function visibleBillingSnapshotForAdminRole(
	role: AdminRole,
	snapshot: BillingSnapshot | null
): BillingSnapshot | null {
	if (!snapshot || role !== 'support') return snapshot;
	return {
		...snapshot,
		stripeCustomerId: null,
		stripeSubscriptionId: null,
		stripeProductId: null,
		stripePriceId: null,
		lastStripeEventId: null,
		lastStripeEventType: null,
		lastStripeEventCreatedAt: null,
		lastProcessedAt: null
	};
}
