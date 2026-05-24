import type { SubscriptionStatus } from '$lib/types/subscription';

export function legacyOrganizationSubscriptionId(status: SubscriptionStatus, subscriptionId: string): string | null {
	return status === 'incomplete_expired' || status === 'canceled' ? null : subscriptionId;
}
