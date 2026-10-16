import {
	deleteAllOwnNotifications,
	deleteOwnNotification,
	listOwnNotifications,
	markAllOwnNotificationsRead,
	markOwnNotificationRead
} from '$features/notifications/index.server';
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestNotificationSelfContext } from '$lib/server/adapters/requestContexts.server';
import { uuidSchema } from '$lib/utils/inputSchemas';

const notificationId = z.object({ id: uuidSchema });
const putInput = z.union([z.object({ markAllRead: z.literal(true) }), notificationId], {
	error: 'Missing id or markAllRead'
});
const deleteInput = z.union([z.object({ deleteAll: z.literal(true) }), notificationId], {
	error: 'Missing notification id or deleteAll'
});

export const _getConfig: RouteConfig<void, unknown, ReturnType<typeof createRequestNotificationSelfContext>> = {
	context: createRequestNotificationSelfContext,
	policyAction: POLICY_ACTION_CATALOG.identity.readOwnNotifications,
	fn: (ctx) => listOwnNotifications(ctx)
};

export const GET = handle(_getConfig);

export const _putConfig: RouteConfig<
	z.infer<typeof putInput>,
	unknown,
	ReturnType<typeof createRequestNotificationSelfContext>
> = {
	context: createRequestNotificationSelfContext,
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnNotifications,
	mutation: true,
	input: putInput,
	fn: async (ctx, input) => {
		if ('markAllRead' in input) await markAllOwnNotificationsRead(ctx);
		else await markOwnNotificationRead(ctx, input.id);
		return { success: true };
	}
};

export const PUT = handle(_putConfig);

export const _deleteConfig: RouteConfig<
	z.infer<typeof deleteInput>,
	unknown,
	ReturnType<typeof createRequestNotificationSelfContext>
> = {
	context: createRequestNotificationSelfContext,
	policyAction: POLICY_ACTION_CATALOG.identity.deleteOwnNotifications,
	mutation: true,
	input: deleteInput,
	fn: async (ctx, input) => {
		if ('deleteAll' in input) await deleteAllOwnNotifications(ctx);
		else await deleteOwnNotification(ctx, input.id);
		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
