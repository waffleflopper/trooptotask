import type { PageServerLoad } from './$types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export async function _loadCanceledCheckoutPageData(
	ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>,
	_input: { checkoutAttemptId: string | null; now?: Date }
) {
	return { orgId: ctx.auth.orgId };
}

export const load: PageServerLoad = async ({ params, locals, cookies, url }) =>
	loadWithContext(locals, cookies, params.orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessBilling,
		readOnlyModeException: 'billing-recovery',
		fn: (ctx) =>
			_loadCanceledCheckoutPageData(ctx, {
				checkoutAttemptId: url.searchParams.get('checkout_attempt_id')
			})
	});
