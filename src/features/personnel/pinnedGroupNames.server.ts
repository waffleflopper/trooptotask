interface PinnedGroupNamesContext {
	auth: { orgId: string; userId: string };
	store: {
		findMany<T>(
			table: string,
			orgId: string,
			filters: { user_id: string },
			options: { select: string; orderBy: Array<{ column: string; ascending: boolean }> }
		): Promise<T[]>;
	};
}

export async function listPinnedGroupNames(ctx: PinnedGroupNamesContext): Promise<string[]> {
	const rows = await ctx.store.findMany<{ group_name: string }>(
		'user_pinned_groups',
		ctx.auth.orgId,
		{ user_id: ctx.auth.userId },
		{ select: 'group_name, sort_order', orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	return rows.map((row) => row.group_name);
}
