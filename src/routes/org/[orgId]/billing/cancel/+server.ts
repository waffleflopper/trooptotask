import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { buildRouteContext, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { cancelBillingSubscriptionForOrganization } from '$lib/server/core/useCases/billingOrganization';
import { requireGovernancePolicy } from '$lib/server/core/useCases/governancePolicy';
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
		await requireGovernancePolicy(
			{ auth: ctx.auth, audit: ctx.audit },
			POLICY_ACTION_CATALOG.organization.accessBilling
		);
		const input = await parseCancellationRequest(event.request);

		await handleUseCaseRequest(
			{
				permission: 'owner',
				mutation: true,
				fn: cancelBillingSubscriptionForOrganization,
				audit: { action: 'billing.cancel', resourceType: 'organization' }
			},
			ctx,
			input
		);

		return json({ success: true });
	} catch (err) {
		return billingApiErrorResponse(err, 'Failed to cancel subscription. Please try again.');
	}
};
