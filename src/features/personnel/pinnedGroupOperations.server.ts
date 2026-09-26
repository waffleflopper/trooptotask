interface PinnedGroupWriteContext {
	auth: { orgId: string; userId: string };
	store: {
		deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;
		insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[]): Promise<T[]>;
		insert<T>(table: string, orgId: string, data: Record<string, unknown>): Promise<T>;
	};
	audit: { log(event: { action: string; resourceType: string }): void };
}

const TABLE = 'user_pinned_groups';

export interface PinnedGroupResult {
	id: string;
	groupName: string;
	sortOrder: number;
}

export async function replacePinnedGroups(
	ctx: PinnedGroupWriteContext,
	groups: string[]
): Promise<{ success: true; groups: string[] }> {
	await ctx.store.deleteWhere(TABLE, ctx.auth.orgId, { user_id: ctx.auth.userId });
	if (groups.length > 0) {
		await ctx.store.insertMany(
			TABLE,
			ctx.auth.orgId,
			groups.map((groupName, sortOrder) => ({
				user_id: ctx.auth.userId,
				group_name: groupName,
				sort_order: sortOrder
			}))
		);
	}
	ctx.audit.log({ action: 'pinned_group.replaced', resourceType: 'pinned_group' });
	return { success: true, groups };
}

export async function pinGroup(
	ctx: PinnedGroupWriteContext,
	data: { groupName: string; sortOrder?: number }
): Promise<PinnedGroupResult> {
	const row = await ctx.store.insert<Record<string, unknown>>(TABLE, ctx.auth.orgId, {
		user_id: ctx.auth.userId,
		group_name: data.groupName,
		sort_order: data.sortOrder ?? 0
	});
	ctx.audit.log({ action: 'pinned_group.created', resourceType: 'pinned_group' });
	return {
		id: row.id as string,
		groupName: row.group_name as string,
		sortOrder: row.sort_order as number
	};
}

export async function unpinGroup(ctx: PinnedGroupWriteContext, groupName: string): Promise<{ success: true }> {
	await ctx.store.deleteWhere(TABLE, ctx.auth.orgId, {
		user_id: ctx.auth.userId,
		group_name: groupName
	});
	ctx.audit.log({ action: 'pinned_group.deleted', resourceType: 'pinned_group' });
	return { success: true };
}
