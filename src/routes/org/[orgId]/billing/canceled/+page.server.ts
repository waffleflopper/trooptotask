import type { PageServerLoad } from './$types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { markCheckoutAttemptCanceled } from '$lib/server/core/useCases/billingCheckoutAttempts';

export async function _loadCanceledCheckoutPageData(
	ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>,
	input: { checkoutAttemptId: string | null; now?: Date }
) {
	const checkoutAttemptId = input.checkoutAttemptId?.trim();
	if (!checkoutAttemptId) return {};

	await markCheckoutAttemptCanceled(ctx.rawStore, ctx.auth.orgId, checkoutAttemptId, input.now ?? new Date());
	return {};
}

export const load: PageServerLoad = async ({ params, locals, cookies, url }) =>
	loadWithContext(locals, cookies, params.orgId, {
		permission: 'owner',
		fn: (ctx) =>
			_loadCanceledCheckoutPageData(ctx, {
				checkoutAttemptId: url.searchParams.get('checkout_attempt_id')
			})
	});
