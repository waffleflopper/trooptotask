import type { PageServerLoad } from './$types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createSupabaseBillingCheckoutRecoveryPorts } from '$lib/server/adapters/billingCheckoutRecovery';
import { readCurrentBillingSnapshot } from '$lib/server/core/useCases/billingState';
import { CHECKOUT_ATTEMPTS_TABLE, type CheckoutAttemptRow } from '$lib/server/core/useCases/billingCheckoutAttempts';
import { recoverCompletedCheckout } from '$lib/server/core/useCases/billingCheckoutRecovery';
import { requireGovernancePolicy } from '$lib/server/core/useCases/governancePolicy';
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

type CheckoutSuccessContext = Pick<UseCaseContext, 'auth' | 'audit' | 'readOnlyGuard' | 'rawStore'>;

export type RecoverCheckoutSuccess = (
	ctx: CheckoutSuccessContext,
	input: { checkoutAttempt: CheckoutAttemptRow; now?: Date }
) => Promise<boolean>;

function isHttpError(error: unknown): error is { status: number } {
	return Boolean(error && typeof error === 'object' && 'status' in error && typeof error.status === 'number');
}

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
			await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.manageBilling, {
				enforceReadOnlyOverlay: false
			});
			const recovered = await (input.recoverCheckoutSuccess ?? _recoverCheckoutSuccess)(ctx, {
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
			if (isHttpError(err)) {
				throw err;
			}
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

export async function _recoverCheckoutSuccess(
	ctx: CheckoutSuccessContext,
	input: { checkoutAttempt: CheckoutAttemptRow; now?: Date }
): Promise<boolean> {
	return recoverCompletedCheckout({
		ports: createSupabaseBillingCheckoutRecoveryPorts(ctx.auth.orgId),
		store: ctx.rawStore,
		orgId: ctx.auth.orgId,
		checkoutAttempt: input.checkoutAttempt,
		now: input.now
	});
}

export const load: PageServerLoad = async ({ params, locals, cookies, url }) =>
	loadWithContext(locals, cookies, params.orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessBilling,
		readOnlyModeException: 'billing-recovery',
		fn: (ctx) =>
			_loadCheckoutSuccessPageData(ctx, {
				checkoutAttemptId: url.searchParams.get('checkout_attempt_id')
			})
	});
