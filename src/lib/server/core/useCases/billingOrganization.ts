import type { AuditPort, AuthContext, DataStore } from '$lib/server/core/ports';
import type { BillingPort } from '$lib/server/core/ports';
import type { SensitiveActionAuthorizer } from '$lib/server/sensitiveActionAuthorizer';
import type { BillingCancellationFeedback } from '$lib/types/subscription';
import type { CancelResult } from './billing';
import { cancel } from './billing';
import { fail } from '$lib/server/core/errors';

interface BillingOrganizationPorts {
	auth: Pick<AuthContext, 'orgId'>;
	store: DataStore;
}

interface BillingCancellationPorts {
	auth: Pick<AuthContext, 'orgId' | 'userId'>;
	rawStore: DataStore;
	billing: BillingPort;
	audit: AuditPort;
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
}

interface BillingOrganizationRow {
	name: string | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	subscription_status: string | null;
	current_period_end: string | null;
}

export interface BillingOrganization {
	name: string;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	subscriptionStatus: string | null;
	currentPeriodEnd: string | null;
}

export async function readBillingOrganization(ports: BillingOrganizationPorts): Promise<BillingOrganization> {
	const org = await ports.store.findOne<BillingOrganizationRow>(
		'organizations',
		ports.auth.orgId,
		{},
		'name, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end'
	);

	if (!org) {
		fail(404, 'Organization not found');
	}

	return {
		name: org.name ?? '',
		stripeCustomerId: org.stripe_customer_id ?? null,
		stripeSubscriptionId: org.stripe_subscription_id ?? null,
		subscriptionStatus: org.subscription_status ?? null,
		currentPeriodEnd: org.current_period_end ?? null
	};
}

export function canManageBillingSubscription(
	org: Pick<BillingOrganization, 'stripeCustomerId' | 'subscriptionStatus'>
): boolean {
	return !!(
		org.stripeCustomerId &&
		org.subscriptionStatus &&
		['active', 'trialing', 'past_due', 'paused'].includes(org.subscriptionStatus)
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
	// Compatibility helper for tests and older support flows. The production cancellation path
	// writes through Billing Snapshot Transition so the snapshot and mirror stay coupled.
	await ports.store.updateById('organizations', ports.auth.orgId, input.orgUpdates);
}

export interface CancelBillingSubscriptionResult {
	success: true;
	stripeCustomerId: string | null;
	canceledSubscriptionId: string;
}

export interface BillingCancellationTransitionPort {
	applyImmediateCancellation(input: {
		orgId: string;
		stripeCustomerId: string | null;
		cancellationFeedback: BillingCancellationFeedback | null;
	}): Promise<void>;
}

interface BillingCancellationTransitionPorts extends BillingCancellationPorts {
	billingCancellationTransition: BillingCancellationTransitionPort;
}

export interface CancelBillingSubscriptionWithTransitionResult extends CancelBillingSubscriptionResult {
	billingTransitionApplied: boolean;
}

export async function cancelBillingSubscriptionForOrganization(
	ports: BillingCancellationPorts,
	input: { confirmedImmediateCancellation?: boolean; cancellationFeedback?: BillingCancellationFeedback | null } = {}
): Promise<CancelBillingSubscriptionResult> {
	const org = await readBillingOrganization({ auth: ports.auth, store: ports.rawStore });
	const subscriptionId = org.stripeSubscriptionId;

	if (!subscriptionId) {
		fail(400, 'No active subscription found');
	}

	if (!canManageBillingSubscription(org)) {
		fail(400, 'Subscription is not in a cancellable state');
	}

	await cancel(ports, {
		subscriptionId,
		confirmedImmediateCancellation: input.confirmedImmediateCancellation,
		cancellationFeedback: input.cancellationFeedback ?? null
	});

	return {
		success: true,
		stripeCustomerId: org.stripeCustomerId,
		canceledSubscriptionId: subscriptionId
	};
}

export async function cancelBillingSubscriptionForOrganizationWithTransition(
	ports: BillingCancellationTransitionPorts,
	input: { confirmedImmediateCancellation?: boolean; cancellationFeedback?: BillingCancellationFeedback | null } = {}
): Promise<CancelBillingSubscriptionWithTransitionResult> {
	const result = await cancelBillingSubscriptionForOrganization(ports, input);

	let billingTransitionApplied = false;
	try {
		await ports.billingCancellationTransition.applyImmediateCancellation({
			orgId: ports.auth.orgId,
			stripeCustomerId: result.stripeCustomerId,
			cancellationFeedback: input.cancellationFeedback ?? null
		});
		billingTransitionApplied = true;
	} catch (snapshotError) {
		console.warn(
			`[billing] Immediate cancellation snapshot for organization ${ports.auth.orgId} will be reconciled by Stripe webhook processing.`,
			snapshotError
		);
	}

	return {
		...result,
		billingTransitionApplied
	};
}
