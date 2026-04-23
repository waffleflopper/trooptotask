import type { AuthContext, DataStore } from '$lib/server/core/ports';
import type { CancelResult } from './billing';
import { fail } from '$lib/server/core/errors';

interface BillingOrganizationPorts {
	auth: Pick<AuthContext, 'orgId'>;
	store: DataStore;
}

interface BillingOrganizationRow {
	name: string | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	subscription_status: string | null;
}

export interface BillingOrganization {
	name: string;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	subscriptionStatus: string | null;
}

export async function readBillingOrganization(ports: BillingOrganizationPorts): Promise<BillingOrganization> {
	const org = await ports.store.findOne<BillingOrganizationRow>(
		'organizations',
		ports.auth.orgId,
		{},
		'name, stripe_customer_id, stripe_subscription_id, subscription_status'
	);

	if (!org) {
		fail(404, 'Organization not found');
	}

	return {
		name: org.name ?? '',
		stripeCustomerId: org.stripe_customer_id ?? null,
		stripeSubscriptionId: org.stripe_subscription_id ?? null,
		subscriptionStatus: org.subscription_status ?? null
	};
}

export function canManageBillingSubscription(
	org: Pick<BillingOrganization, 'stripeCustomerId' | 'subscriptionStatus'>
): boolean {
	return !!(
		org.stripeCustomerId &&
		org.subscriptionStatus &&
		['active', 'past_due', 'paused'].includes(org.subscriptionStatus)
	);
}

export async function persistBillingCustomerId(
	ports: BillingOrganizationPorts,
	input: { customerId: string }
): Promise<void> {
	await ports.store.updateById('organizations', ports.auth.orgId, {
		stripe_customer_id: input.customerId
	});
}

export async function applyBillingCancellation(
	ports: BillingOrganizationPorts,
	input: Pick<CancelResult, 'orgUpdates'>
): Promise<void> {
	await ports.store.updateById('organizations', ports.auth.orgId, input.orgUpdates);
}
