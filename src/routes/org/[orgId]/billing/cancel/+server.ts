import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { createSupabaseBillingCancellationTransitionPort } from '$lib/server/adapters/billingCancellationTransition';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { cancelBillingSubscriptionForOrganizationWithTransition } from '$lib/server/core/useCases/billingOrganization';
import type { BillingCancellationFeedback } from '$lib/types/subscription';
import { billingApiErrorResponse } from '../billingApiErrors';

const CANCELLATION_FEEDBACK = new Set<BillingCancellationFeedback>([
	'customer_service',
	'low_quality',
	'missing_features',
	'other',
	'switched_service',
	'too_complex',
	'too_expensive',
	'unused'
]);

type CancellationRequest = {
	confirmedImmediateCancellation: boolean;
	cancellationFeedback: BillingCancellationFeedback | null;
};

async function parseCancellationRequest(request: Request): Promise<CancellationRequest> {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const confirmedImmediateCancellation = body.confirmedImmediateCancellation === true;
	const rawFeedback = body.cancellationFeedback;

	if (!confirmedImmediateCancellation) {
		fail(400, 'Immediate cancellation requires explicit owner confirmation');
	}

	if (rawFeedback === undefined || rawFeedback === null || rawFeedback === '') {
		return { confirmedImmediateCancellation, cancellationFeedback: null };
	}

	if (typeof rawFeedback !== 'string' || !CANCELLATION_FEEDBACK.has(rawFeedback as BillingCancellationFeedback)) {
		fail(400, 'Cancellation feedback is not supported');
	}

	return {
		confirmedImmediateCancellation,
		cancellationFeedback: rawFeedback as BillingCancellationFeedback
	};
}

export const POST: RequestHandler = async (event) => {
	if (!isBillingEnabled) {
		return json({ error: 'Billing is not enabled' }, { status: 400 });
	}

	try {
		const ctx = await buildRouteContext(event);
		const input = await parseCancellationRequest(event.request);

		const result = await handleUseCaseRequest<CancellationRequest, { billingTransitionApplied: boolean }>(
			{
				policyAction: POLICY_ACTION_CATALOG.organization.manageBilling,
				mutation: true,
				fn: (useCaseCtx, useCaseInput) =>
					cancelBillingSubscriptionForOrganizationWithTransition(
						{
							...useCaseCtx,
							billingCancellationTransition: createSupabaseBillingCancellationTransitionPort()
						},
						useCaseInput
					),
				audit: { action: 'billing.cancel', resourceType: 'organization' }
			},
			ctx,
			input
		);

		return json({ success: true, billingTransitionApplied: result.billingTransitionApplied });
	} catch (err) {
		return billingApiErrorResponse(err, 'Failed to cancel subscription. Please try again.');
	}
};
