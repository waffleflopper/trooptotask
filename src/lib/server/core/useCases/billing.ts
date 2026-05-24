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
import type { AuditPort, AuthContext, BillingPort, DataStore } from '$lib/server/core/ports';
import {
	TAX_DISABLED_CHECKOUT_SESSION_CONFIGURATION,
	type CheckoutSessionConfiguration
} from '$lib/server/billing/checkoutConfiguration';
import { fail } from '$lib/server/core/errors';
import {
	appendCheckoutAttemptId,
	createCheckoutAttemptPlaceholder,
	expireStaleCheckoutAttempts,
	findActiveCheckoutAttempt,
	findReusableCheckoutAttempt,
	isActiveCheckoutAttemptConflict,
	markCheckoutAttemptFailed,
	markCheckoutAttemptReady
} from './billingCheckoutAttempts';
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
	rawStore: DataStore;
}

export interface CheckoutInput {
	tier: 'team' | 'unit';
	priceId: string;
	customerEmail: string;
	orgName: string;
	existingCustomerId?: string;
	successUrl: string;
	cancelUrl: string;
	checkoutConfiguration?: CheckoutSessionConfiguration;
	now?: Date;
}

export async function checkout(
	ctx: BillingPorts,
	input: CheckoutInput
): Promise<{ url: string; customerId: string | null; reused: boolean; message?: string; checkoutAttemptId: string }> {
	if (!input.customerEmail) fail(400, 'User email not found');
	const sensitiveAction = await authorizeBillingSensitiveAction(ctx, {
		action: BILLING_CHECKOUT_ACTION,
		deniedAuditAction: 'billing.checkout_authorization_denied',
		details: { tier: input.tier }
	});

	const now = input.now ?? new Date();
	await expireStaleCheckoutAttempts(ctx.rawStore, ctx.auth.orgId, now);
	const activeAttempt = await findActiveCheckoutAttempt(ctx.rawStore, ctx.auth.orgId, now);
	if (activeAttempt) return reuseOrBlockActiveCheckoutAttempt(ctx, input, sensitiveAction, activeAttempt);

	const checkoutAttempt = await createCheckoutAttemptOrReuse(ctx.rawStore, {
		orgId: ctx.auth.orgId,
		commercialPlan: input.tier,
		stripePriceId: input.priceId,
		now
	});
	if (checkoutAttempt.checkout_url)
		return reuseOrBlockActiveCheckoutAttempt(ctx, input, sensitiveAction, checkoutAttempt);

	try {
		const result = await ctx.billing.createCheckoutSession({
			orgId: ctx.auth.orgId,
			...input,
			checkoutConfiguration: input.checkoutConfiguration ?? TAX_DISABLED_CHECKOUT_SESSION_CONFIGURATION,
			checkoutAttemptId: checkoutAttempt.id,
			successUrl: appendCheckoutAttemptId(input.successUrl, checkoutAttempt.id),
			cancelUrl: appendCheckoutAttemptId(input.cancelUrl, checkoutAttempt.id)
		});
		await markCheckoutAttemptReady(ctx.rawStore, {
			orgId: ctx.auth.orgId,
			attemptId: checkoutAttempt.id,
			sessionId: result.sessionId ?? null,
			customerId: result.customerId,
			checkoutUrl: result.url,
			expiresAt: result.expiresAt ?? null,
			now
		});
		auditSuccessfulSensitiveBillingAction(ctx, 'billing.checkout_authorized', sensitiveAction, {
			tier: input.tier,
			checkoutAttemptId: checkoutAttempt.id
		});
		return { ...result, reused: false, checkoutAttemptId: checkoutAttempt.id };
	} catch (err) {
		await markCheckoutAttemptFailed(ctx.rawStore, ctx.auth.orgId, checkoutAttempt.id, now);
		throw err;
	}
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

async function createCheckoutAttemptOrReuse(
	store: DataStore,
	input: Parameters<typeof createCheckoutAttemptPlaceholder>[1]
): Promise<Awaited<ReturnType<typeof createCheckoutAttemptPlaceholder>>> {
	try {
		return await createCheckoutAttemptPlaceholder(store, input);
	} catch (err) {
		if (isActiveCheckoutAttemptConflict(err)) {
			const activeAttempt =
				(await findReusableCheckoutAttempt(store, input.orgId, input.stripePriceId, input.now)) ??
				(await findActiveCheckoutAttempt(store, input.orgId, input.now));
			if (activeAttempt) return activeAttempt;
		}
		throw err;
	}
}

function reuseOrBlockActiveCheckoutAttempt(
	ctx: BillingPorts,
	input: CheckoutInput,
	sensitiveAction: Record<string, unknown>,
	attempt: Awaited<ReturnType<typeof findActiveCheckoutAttempt>>
): { url: string; customerId: string | null; reused: boolean; message?: string; checkoutAttemptId: string } {
	if (!attempt) fail(409, 'A checkout session is being created for this organization. Please try again shortly.');
	if (attempt.stripe_price_id !== input.priceId || attempt.commercial_plan !== input.tier) {
		fail(
			409,
			'A checkout session is already open for a different plan. Complete or wait for that session to expire before starting another checkout.'
		);
	}
	if (!attempt.checkout_url) {
		fail(409, 'A checkout session is being created for this organization. Please try again shortly.');
	}

	auditSuccessfulSensitiveBillingAction(ctx, 'billing.checkout_reused', sensitiveAction, {
		tier: input.tier,
		checkoutAttemptId: attempt.id
	});
	return {
		url: attempt.checkout_url,
		customerId: attempt.stripe_customer_id,
		reused: true,
		message: 'A checkout session is already open. Redirecting you back to it.',
		checkoutAttemptId: attempt.id
	};
}
