import type { AuthContext, BillingPort } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';

export interface BillingPorts {
	auth: AuthContext;
	billing: BillingPort;
}

export interface CheckoutInput {
	tier: 'team' | 'unit';
	customerEmail: string;
	orgName: string;
	existingCustomerId?: string;
	successUrl: string;
	cancelUrl: string;
}

export async function checkout(
	ctx: BillingPorts,
	input: CheckoutInput
): Promise<{ url: string; customerId: string }> {
	if (!input.customerEmail) fail(400, 'User email not found');
	return ctx.billing.createCheckoutSession({
		orgId: ctx.auth.orgId,
		...input
	});
}

export interface PortalInput {
	customerId: string;
	returnUrl: string;
}

export async function portal(ctx: BillingPorts, input: PortalInput): Promise<{ url: string }> {
	if (!input.customerId) fail(400, 'No active subscription found for this organization');
	return ctx.billing.createPortalSession(input.customerId, input.returnUrl);
}

export interface CancelInput {
	subscriptionId: string;
}

export interface CancelResult {
	success: true;
	orgUpdates: { tier: 'free'; subscription_status: null; stripe_subscription_id: null };
}

export async function cancel(ctx: BillingPorts, input: CancelInput): Promise<CancelResult> {
	if (!input.subscriptionId) fail(400, 'No active subscription found');
	await ctx.billing.cancelSubscription(input.subscriptionId);
	return {
		success: true,
		orgUpdates: { tier: 'free', subscription_status: null, stripe_subscription_id: null }
	};
}
