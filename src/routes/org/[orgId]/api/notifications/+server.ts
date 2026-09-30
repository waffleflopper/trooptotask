import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import {
	deleteAllOwnNotifications,
	deleteOwnNotification,
	listOwnNotifications,
	markAllOwnNotificationsRead,
	markOwnNotificationRead
} from '$features/notifications/index.server';

export const _getConfig: RouteConfig<void, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.readOwnNotifications,
	fn: (ctx) => listOwnNotifications(ctx.notificationSelf)
};

export const GET = handle(_getConfig);

export const _putConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnNotifications,
	mutation: true,
	fn: async (ctx, input) => {
		if (input.markAllRead) {
			await markAllOwnNotificationsRead(ctx.notificationSelf);
			return { success: true };
		}

		if (input.id) {
			await markOwnNotificationRead(ctx.notificationSelf, input.id as string);
			return { success: true };
		}

		fail(400, 'Missing id or markAllRead');
	}
};

export const PUT = handle(_putConfig);

export const _deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.deleteOwnNotifications,
	mutation: true,
	fn: async (ctx, input) => {
		if (input.deleteAll) {
			await deleteAllOwnNotifications(ctx.notificationSelf);
			return { success: true };
		}

		if (!input.id) fail(400, 'Missing notification id or deleteAll');

		await deleteOwnNotification(ctx.notificationSelf, input.id as string);
		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
