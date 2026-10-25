import { isHttpError, isRedirect } from '@sveltejs/kit';
import { ACCOUNT_NOTIFICATIONS_DEPENDENCY } from '$features/notifications';
import type { Notification } from '$features/notifications/contracts';
import { listOwnNotifications } from '$features/notifications/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestNotificationSelfContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoad } from './$types';

/** `notifications` is null when the read failed, so the page shows its load error inside the Account layout. */
export const load: PageServerLoad = async ({ locals, cookies, params, depends }) => {
	depends(ACCOUNT_NOTIFICATIONS_DEPENDENCY);
	try {
		const notifications: Notification[] = await loadWithContext(locals, cookies, params.orgId, {
			context: createRequestNotificationSelfContext,
			policyAction: POLICY_ACTION_CATALOG.identity.readOwnNotifications,
			fn: (ctx) => listOwnNotifications(ctx, 100)
		});
		return { notifications };
	} catch (cause) {
		if (isRedirect(cause) || (isHttpError(cause) && cause.status < 500)) throw cause;
		console.error('[notifications] account list failed', cause);
		return { notifications: null };
	}
};
