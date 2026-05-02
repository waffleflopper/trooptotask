import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	deleteAllOwnNotifications,
	deleteOwnNotification,
	listOwnNotifications,
	markAllOwnNotificationsRead,
	markOwnNotificationRead
} from '$lib/server/core/useCases/notifications';

export const GET = handle<void, unknown>({
	permission: 'none',
	deferPolicyToUseCase: true,
	fn: (ctx) => listOwnNotifications(ctx)
});

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'none',
	mutation: true,
	deferPolicyToUseCase: true,
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
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'none',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: async (ctx, input) => {
		if (input.deleteAll) {
			await deleteAllOwnNotifications(ctx);
			return { success: true };
		}

		if (!input.id) fail(400, 'Missing notification id or deleteAll');

		await deleteOwnNotification(ctx, input.id as string);
		return { success: true };
	}
});
