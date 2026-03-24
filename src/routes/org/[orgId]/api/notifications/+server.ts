import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

export const GET = handle<void, unknown>({
	permission: 'personnel',
	fn: async (ctx) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		return ctx.store.findMany(
			'notifications',
			ctx.auth.orgId,
			{ user_id: userId },
			{
				orderBy: [{ column: 'created_at', ascending: false }],
				limit: 20
			}
		);
	}
});

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx, input) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		if (input.markAllRead) {
			const unread = await ctx.store.findMany<{ id: string }>('notifications', ctx.auth.orgId, {
				user_id: userId,
				read: false
			});
			for (const n of unread) {
				await ctx.store.update('notifications', ctx.auth.orgId, n.id, { read: true });
			}
			ctx.audit.log({ action: 'notification.mark_all_read', resourceType: 'notification' });
			return { success: true };
		}

		if (input.id) {
			await ctx.store.update('notifications', ctx.auth.orgId, input.id as string, { read: true });
			ctx.audit.log({ action: 'notification.read', resourceType: 'notification', resourceId: input.id as string });
			return { success: true };
		}

		fail(400, 'Missing id or markAllRead');
	}
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx, input) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		if (input.deleteAll) {
			await ctx.store.deleteWhere('notifications', ctx.auth.orgId, { user_id: userId });
			ctx.audit.log({ action: 'notification.delete_all', resourceType: 'notification' });
			return { success: true };
		}

		if (!input.id) fail(400, 'Missing notification id or deleteAll');

		await ctx.store.delete('notifications', ctx.auth.orgId, input.id as string);
		ctx.audit.log({ action: 'notification.deleted', resourceType: 'notification', resourceId: input.id as string });
		return { success: true };
	}
});
