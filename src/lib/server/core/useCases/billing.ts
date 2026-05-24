/**
 * Billing use cases — checkout, customer portal, and subscription lifecycle.
 *
 * All functions require `BillingPorts` (auth + billing). They guard against unauthorized
 * access at the use-case level and delegate to the BillingPort adapter (Stripe in prod).
 *
 * These use cases are only reachable when PUBLIC_BILLING_ENABLED is set; the billing
 * routes guard that at the route level. Tests use the in-memory BillingPort from
 * `inMemory.ts`.
 */
import type { AuditPort, AuthContext, BillingPort } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import {
	BILLING_CANCEL_ACTION,
	BILLING_CHECKOUT_ACTION,
	BILLING_PORTAL_ACTION,
	checkSensitiveAction,
	sensitiveActionDecisionAuditDetails,
	throwSensitiveActionFailure,
	type SensitiveAction,
	type SensitiveActionAuthorizer,
	type SensitiveActionDecision
} from '$lib/server/sensitiveActionAuthorizer';

export interface BillingPorts {
	auth: Pick<AuthContext, 'orgId' | 'userId'>;
	billing: BillingPort;
	audit: AuditPort;
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
}

export interface CheckoutInput {
	tier: 'team' | 'unit';
	customerEmail: string;
	orgName: string;
	existingCustomerId?: string;
	successUrl: string;
	cancelUrl: string;
}

export async function checkout(ctx: BillingPorts, input: CheckoutInput): Promise<{ url: string; customerId: string }> {
	if (!input.customerEmail) fail(400, 'User email not found');
	const sensitiveAction = await authorizeBillingSensitiveAction(ctx, {
		action: BILLING_CHECKOUT_ACTION,
		deniedAuditAction: 'billing.checkout_authorization_denied',
		details: { tier: input.tier }
	});

	const result = await ctx.billing.createCheckoutSession({
		orgId: ctx.auth.orgId,
		...input
	});
	auditSuccessfulSensitiveBillingAction(ctx, 'billing.checkout_authorized', sensitiveAction, { tier: input.tier });
	return result;
}

export interface PortalInput {
	customerId: string;
	returnUrl: string;
}

export async function portal(ctx: BillingPorts, input: PortalInput): Promise<{ url: string }> {
	if (!input.customerId) fail(400, 'No active subscription found for this organization');
	const sensitiveAction = await authorizeBillingSensitiveAction(ctx, {
		action: BILLING_PORTAL_ACTION,
		deniedAuditAction: 'billing.portal_authorization_denied'
	});

	const result = await ctx.billing.createPortalSession(input.customerId, input.returnUrl);
	auditSuccessfulSensitiveBillingAction(ctx, 'billing.portal_authorized', sensitiveAction);
	return result;
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
	const sensitiveAction = await authorizeBillingSensitiveAction(ctx, {
		action: BILLING_CANCEL_ACTION,
		deniedAuditAction: 'billing.cancel_authorization_denied'
	});

	await ctx.billing.cancelSubscription(input.subscriptionId);
	auditSuccessfulSensitiveBillingAction(ctx, 'billing.cancel_authorized', sensitiveAction);
	return {
		success: true,
		orgUpdates: { tier: 'free', subscription_status: null, stripe_subscription_id: null }
	};
}

async function authorizeBillingSensitiveAction(
	ctx: BillingPorts,
	input: { action: SensitiveAction; deniedAuditAction: string; details?: Record<string, unknown> }
): Promise<Record<string, unknown>> {
	const target = { type: 'organization', id: ctx.auth.orgId };
	if (!ctx.auth.userId) {
		const decision = checkSensitiveAction({
			action: input.action,
			target,
			actor: { userId: null }
		});
		auditDeniedSensitiveBillingAction(ctx, input.deniedAuditAction, decision, input.details);
		failSensitiveBillingAction(decision);
	}

	const decision = await ctx.sensitiveActionAuthorizer.authorize({
		action: input.action,
		actorUserId: ctx.auth.userId,
		target
	});
	const sensitiveAction = sensitiveActionDecisionAuditDetails(decision);

	if (!decision.allowed) {
		auditDeniedSensitiveBillingAction(ctx, input.deniedAuditAction, decision, input.details);
		failSensitiveBillingAction(decision);
	}

	return sensitiveAction;
}

function failSensitiveBillingAction(decision: SensitiveActionDecision): never {
	throwSensitiveActionFailure(decision);
}

function auditDeniedSensitiveBillingAction(
	ctx: BillingPorts,
	action: string,
	decision: SensitiveActionDecision,
	details: Record<string, unknown> = {}
): void {
	ctx.audit.log({
		action,
		resourceType: 'organization',
		resourceId: ctx.auth.orgId,
		details: {
			...details,
			sensitiveAction: sensitiveActionDecisionAuditDetails(decision)
		},
		severity: 'warning'
	});
}

function auditSuccessfulSensitiveBillingAction(
	ctx: BillingPorts,
	action: string,
	sensitiveAction: Record<string, unknown>,
	details: Record<string, unknown> = {}
): void {
	ctx.audit.log({
		action,
		resourceType: 'organization',
		resourceId: ctx.auth.orgId,
		details: {
			...details,
			sensitiveAction
		}
	});
}
