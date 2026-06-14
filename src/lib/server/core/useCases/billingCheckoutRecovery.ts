import type { DataStore } from '$lib/server/core/ports';
import { type CheckoutAttemptRow, markCheckoutAttemptCompleted } from './billingCheckoutAttempts';

export interface BillingCheckoutRecoverySession {
	id: string;
	status: string | null;
	paymentStatus: string | null;
	customerId: string | null;
	subscriptionId: string | null;
	metadata: Record<string, string | undefined> | null;
}

export interface BillingCheckoutRecoveryPorts {
	retrieveCheckoutSession(sessionId: string): Promise<BillingCheckoutRecoverySession>;
	reconcileOrganizationBilling(orgId: string): Promise<void>;
	markCheckoutAttemptCompleted(
		store: DataStore,
		orgId: string,
		attemptId: string,
		now: Date
	): Promise<CheckoutAttemptRow | null>;
}

export async function recoverCompletedCheckout(input: {
	ports: BillingCheckoutRecoveryPorts;
	store: DataStore;
	orgId: string;
	checkoutAttempt: CheckoutAttemptRow;
	now?: Date;
}): Promise<boolean> {
	const attempt = input.checkoutAttempt;
	if (!attempt.stripe_checkout_session_id || attempt.status !== 'in_progress') return false;

	const session = await input.ports.retrieveCheckoutSession(attempt.stripe_checkout_session_id);
	if (session.status !== 'complete' || session.paymentStatus !== 'paid' || !session.subscriptionId) return false;
	if (session.metadata?.orgId !== input.orgId) return false;
	if (session.metadata?.checkoutAttemptId !== attempt.id) return false;

	await input.ports.reconcileOrganizationBilling(input.orgId);
	await input.ports.markCheckoutAttemptCompleted(input.store, input.orgId, attempt.id, input.now ?? new Date());

	return true;
}

export function createDefaultBillingCheckoutRecoveryPorts(input: {
	retrieveCheckoutSession: BillingCheckoutRecoveryPorts['retrieveCheckoutSession'];
	reconcileOrganizationBilling: BillingCheckoutRecoveryPorts['reconcileOrganizationBilling'];
}): BillingCheckoutRecoveryPorts {
	return {
		...input,
		markCheckoutAttemptCompleted
	};
}
