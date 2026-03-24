import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

export const POST = handle<void, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		const existing = await ctx.store.findOne('getting_started_progress', ctx.auth.orgId, { user_id: userId });

		if (existing) {
			await ctx.store.update(
				'getting_started_progress',
				ctx.auth.orgId,
				(existing as Record<string, unknown>).id as string,
				{ dismissed_at: new Date().toISOString() }
			);
		} else {
			await ctx.store.insert('getting_started_progress', ctx.auth.orgId, {
				user_id: userId,
				dismissed_at: new Date().toISOString()
			});
		}

		return { success: true };
	}
});

export const DELETE = handle<void, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		const existing = await ctx.store.findOne<{ id: string }>('getting_started_progress', ctx.auth.orgId, {
			user_id: userId
		});

		if (existing) {
			await ctx.store.update('getting_started_progress', ctx.auth.orgId, existing.id, {
				dismissed_at: null
			});
		}

		return { success: true };
	}
});
