import { ACCOUNT_NOTIFICATIONS_DEPENDENCY } from '$features/notifications';
import { listOwnNotifications } from '$features/notifications/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestNotificationSelfContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params, depends }) => {
	depends(ACCOUNT_NOTIFICATIONS_DEPENDENCY);
	return {
		notifications: await loadWithContext(locals, cookies, params.orgId, {
			context: createRequestNotificationSelfContext,
			policyAction: POLICY_ACTION_CATALOG.identity.readOwnNotifications,
			fn: (ctx) => listOwnNotifications(ctx, 100)
		})
	};
};
