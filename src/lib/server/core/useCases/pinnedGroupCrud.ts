import type { UseCaseContext } from '$lib/server/core/ports';

const TABLE = 'user_pinned_groups';

function isSandbox(ctx: UseCaseContext): boolean {
	return ctx.auth.userId === null;
}

export interface PinnedGroupUseCases {
	replace(ctx: UseCaseContext, groups: string[]): Promise<{ success: true; groups: string[] }>;
	pin(
		ctx: UseCaseContext,
		data: { groupName: string; sortOrder?: number }
	): Promise<{ success: true; groups: never[] } | { groupName: string; sortOrder: number }>;
	unpin(ctx: UseCaseContext, groupName: string): Promise<{ success: true } | { success: true; groups: never[] }>;
}

export function createPinnedGroupUseCases(): PinnedGroupUseCases {
	return {
		async replace(ctx, groups) {
			if (isSandbox(ctx)) {
				return { success: true, groups: [] };
			}

			const userId = ctx.auth.userId!;

			// Delete existing pins for this user
			await ctx.store.deleteWhere(TABLE, ctx.auth.orgId, { user_id: userId });

			// Insert new pins
			if (groups.length > 0) {
				const rows = groups.map((groupName, i) => ({
					user_id: userId,
					group_name: groupName,
					sort_order: i
				}));
				await ctx.store.insertMany(TABLE, ctx.auth.orgId, rows);
			}

			ctx.audit.log({
				action: 'pinned_group.replaced',
				resourceType: 'pinned_group'
			});

			return { success: true, groups };
		},

		async pin(ctx, data) {
			if (isSandbox(ctx)) {
				return { success: true, groups: [] };
			}

			const userId = ctx.auth.userId!;

			const row = await ctx.store.insert<Record<string, unknown>>(TABLE, ctx.auth.orgId, {
				user_id: userId,
				group_name: data.groupName,
				sort_order: data.sortOrder ?? 0
			});

			ctx.audit.log({
				action: 'pinned_group.created',
				resourceType: 'pinned_group'
			});

			return {
				id: row.id as string,
				groupName: row.group_name as string,
				sortOrder: row.sort_order as number
			};
		},

		async unpin(ctx, groupName) {
			if (isSandbox(ctx)) {
				return { success: true };
			}

			const userId = ctx.auth.userId!;

			await ctx.store.deleteWhere(TABLE, ctx.auth.orgId, {
				user_id: userId,
				group_name: groupName
			});

			ctx.audit.log({
				action: 'pinned_group.deleted',
				resourceType: 'pinned_group'
			});

			return { success: true };
		}
	};
}
