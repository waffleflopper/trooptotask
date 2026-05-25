import type { PageServerLoad } from './$types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseBillingReconciliationStore } from '$lib/server/adapters/supabaseBillingReconciliation';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import { getConfiguredPriceCatalog } from '$lib/server/billing/priceCatalog';
import { readCurrentBillingSnapshot } from '$lib/server/core/useCases/billingState';
import {
	CHECKOUT_ATTEMPTS_TABLE,
	markCheckoutAttemptCompleted,
	type CheckoutAttemptRow
} from '$lib/server/core/useCases/billingCheckoutAttempts';
import { reconcileOrganizationBilling } from '$lib/server/core/useCases/billingReconciliation';
import { getAdminClient } from '$lib/server/supabase';
import { createStripeBillingReconciliationProvider, retrieveCheckoutSessionForRecovery } from '$lib/server/stripe';
import type { BillingSnapshot } from '$lib/types/subscription';

export type CheckoutSuccessState = 'active' | 'pending' | 'payment_incomplete' | 'still_syncing';

export interface CheckoutSuccessStatus {
	state: CheckoutSuccessState;
	eyebrow: string;
	title: string;
	description: string;
	detail: string;
}

const PAYMENT_INCOMPLETE_STATUSES = new Set(['incomplete', 'incomplete_expired', 'past_due', 'unpaid']);
const PENDING_CHECKOUT_ATTEMPT_STATUSES = new Set(['in_progress', 'completed']);

type CheckoutSuccessContext = Pick<UseCaseContext, 'auth' | 'rawStore'>;

export type RecoverCheckoutSuccess = (
	ctx: CheckoutSuccessContext,
	input: { checkoutAttempt: CheckoutAttemptRow; now?: Date }
) => Promise<boolean>;

function isPaidPlanActive(snapshot: BillingSnapshot): boolean {
	return (
		(snapshot.commercialPlan === 'team' || snapshot.commercialPlan === 'unit') &&
		(snapshot.subscriptionStatus === 'active' || snapshot.subscriptionStatus === 'trialing') &&
		snapshot.syncStatus === 'synced'
	);
}

export function _buildCheckoutSuccessStatus(input: {
	snapshot: BillingSnapshot;
	checkoutAttempt: Pick<CheckoutAttemptRow, 'status'> | null;
}): CheckoutSuccessStatus {
	if (isPaidPlanActive(input.snapshot)) {
		return {
			state: 'active',
			eyebrow: 'Billing update',
			title: 'Plan Active',
			description: 'Your plan is active. The new limits are available for this organization.',
			detail: 'You can review plan details, invoices, and payment settings from Billing.'
		};
	}

	if (
		input.checkoutAttempt &&
		PENDING_CHECKOUT_ATTEMPT_STATUSES.has(input.checkoutAttempt.status) &&
		input.snapshot.subscriptionStatus !== 'incomplete' &&
		input.snapshot.subscriptionStatus !== 'incomplete_expired' &&
		input.snapshot.subscriptionStatus !== 'past_due' &&
		input.snapshot.subscriptionStatus !== 'unpaid'
	) {
		return {
			state: 'pending',
			eyebrow: 'Billing update',
			title: 'Checkout Received',
			description: 'Checkout finished, and TroopToTask is confirming the plan update.',
			detail: 'This usually updates shortly. Open Billing to check the latest status.'
		};
	}

	if (input.snapshot.subscriptionStatus && PAYMENT_INCOMPLETE_STATUSES.has(input.snapshot.subscriptionStatus)) {
		return {
			state: 'payment_incomplete',
			eyebrow: 'Billing update',
			title: 'Payment Needs Attention',
			description: 'Checkout was started, but payment is not complete yet.',
			detail: 'Open Billing to update payment details or try again. Your current data remains available.'
		};
	}

	if (input.snapshot.syncStatus === 'pending') {
		return {
			state: 'pending',
			eyebrow: 'Billing update',
			title: 'Checkout Received',
			description: 'Checkout finished, and TroopToTask is confirming the plan update.',
			detail: 'This usually updates shortly. Open Billing to check the latest status.'
		};
	}

	return {
		state: 'still_syncing',
		eyebrow: 'Billing update',
		title: 'Billing Is Still Updating',
		description: 'Checkout returned to TroopToTask, but the billing record has not finished updating yet.',
		detail: 'Open Billing to refresh the status or return to the dashboard while it catches up.'
	};
}

export async function _loadCheckoutSuccessPageData(
	ctx: CheckoutSuccessContext,
	input: { checkoutAttemptId: string | null; recoverCheckoutSuccess?: RecoverCheckoutSuccess }
) {
	const checkoutAttemptId = input.checkoutAttemptId?.trim();
	let [snapshot, checkoutAttempt] = await Promise.all([
		readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore }),
		checkoutAttemptId
			? ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
					id: checkoutAttemptId
				})
			: Promise.resolve(null)
	]);

	if (!isPaidPlanActive(snapshot) && checkoutAttempt && PENDING_CHECKOUT_ATTEMPT_STATUSES.has(checkoutAttempt.status)) {
		try {
			const recovered = await (input.recoverCheckoutSuccess ?? _recoverCheckoutSuccessFromStripe)(ctx, {
				checkoutAttempt
			});
			if (recovered) {
				[snapshot, checkoutAttempt] = await Promise.all([
					readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore }),
					ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
						id: checkoutAttempt.id
					})
				]);
			}
		} catch (err) {
			console.warn(
				`[billing-success] Checkout success recovery for organization ${ctx.auth.orgId} will be retried by billing reconciliation.`,
				err
			);
		}
	}

	return {
		orgId: ctx.auth.orgId,
		checkoutStatus: _buildCheckoutSuccessStatus({
			snapshot,
			checkoutAttempt
		})
	};
}

export async function _recoverCheckoutSuccessFromStripe(
	ctx: CheckoutSuccessContext,
	input: { checkoutAttempt: CheckoutAttemptRow; now?: Date }
): Promise<boolean> {
	const attempt = input.checkoutAttempt;
	if (!attempt.stripe_checkout_session_id || attempt.status !== 'in_progress') return false;

	const session = await retrieveCheckoutSessionForRecovery(attempt.stripe_checkout_session_id);
	if (session.status !== 'complete' || session.paymentStatus !== 'paid' || !session.subscriptionId) return false;
	if (session.metadata?.orgId !== ctx.auth.orgId) return false;
	if (session.metadata?.checkoutAttemptId !== attempt.id) return false;

	const adminClient = getAdminClient();
	await reconcileOrganizationBilling({
		orgId: ctx.auth.orgId,
		store: createSupabaseBillingReconciliationStore(adminClient),
		provider: createStripeBillingReconciliationProvider(),
		subscription: createSupabaseSubscriptionAdapter(adminClient, ctx.auth.orgId),
		priceCatalog: getConfiguredPriceCatalog(),
		dryRun: false
	});

	await markCheckoutAttemptCompleted(ctx.rawStore, ctx.auth.orgId, attempt.id, input.now ?? new Date());

	return true;
}

export const load: PageServerLoad = async ({ params, locals, cookies, url }) =>
	loadWithContext(locals, cookies, params.orgId, {
		permission: 'owner',
		fn: (ctx) =>
			_loadCheckoutSuccessPageData(ctx, {
				checkoutAttemptId: url.searchParams.get('checkout_attempt_id')
			})
	});
