import {
	deleteAllOwnNotifications,
	deleteOwnNotification,
	listOwnNotifications,
	markAllOwnNotificationsRead,
	markOwnNotificationRead
} from '$features/notifications/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestNotificationSelfContext } from '$lib/server/adapters/requestContexts.server';

export const _getConfig: RouteConfig<void, unknown, ReturnType<typeof createRequestNotificationSelfContext>> = {
	context: createRequestNotificationSelfContext,
	policyAction: POLICY_ACTION_CATALOG.identity.readOwnNotifications,
	fn: (ctx) => listOwnNotifications(ctx)
};

export const GET = handle(_getConfig);

export const _putConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestNotificationSelfContext>
> = {
	context: createRequestNotificationSelfContext,
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnNotifications,
	mutation: true,
	fn: async (ctx, input) => {
		if (input.markAllRead) {
			await markAllOwnNotificationsRead(ctx);
			return { success: true };
		}

		if (input.id) {
			await markOwnNotificationRead(ctx, input.id as string);
			return { success: true };
		}

		fail(400, 'Missing id or markAllRead');
	}
};

export const PUT = handle(_putConfig);

export const _deleteConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestNotificationSelfContext>
> = {
	context: createRequestNotificationSelfContext,
	policyAction: POLICY_ACTION_CATALOG.identity.deleteOwnNotifications,
	mutation: true,
	fn: async (ctx, input) => {
		if (input.deleteAll) {
			await deleteAllOwnNotifications(ctx);
			return { success: true };
		}

		if (!input.id) fail(400, 'Missing notification id or deleteAll');

		await deleteOwnNotification(ctx, input.id as string);
		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
