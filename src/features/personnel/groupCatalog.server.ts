import { GroupEntity } from './groupEntity.server';
import type { Group } from './contracts';

interface GroupCatalogQueryContext {
	auth: { orgId: string };
	store: {
		findMany<T>(
			table: string,
			orgId: string,
			filters: undefined,
			options: {
				select: string;
				orderBy?: Array<{ column: string; ascending: boolean }>;
				inFilters?: Record<string, string[]>;
			}
		): Promise<T[]>;
	};
}

interface GroupCatalogOptions {
	groupIds?: string[];
}

// The caller supplies its request store. Current lane admission and Group SELECT RLS
// decide visibility; this read does not require a Personnel capability or admin provider.
export async function listGroupCatalog(
	ctx: GroupCatalogQueryContext,
	options: GroupCatalogOptions = {}
): Promise<Group[]> {
	if (options.groupIds?.length === 0) return [];

	const rows = await ctx.store.findMany<Record<string, unknown>>(GroupEntity.table, ctx.auth.orgId, undefined, {
		select: GroupEntity.select,
		...(options.groupIds ? { inFilters: { id: options.groupIds } } : {}),
		orderBy: [{ column: 'sort_order', ascending: true }]
	});
	return GroupEntity.fromDbArray(rows);
}

export async function findGroupNamesByIds(
	ctx: GroupCatalogQueryContext,
	groupIds: string[]
): Promise<Map<string, string>> {
	if (groupIds.length === 0) return new Map();

	const rows = await ctx.store.findMany<{ id: string; name?: string | null }>(
		GroupEntity.table,
		ctx.auth.orgId,
		undefined,
		{ select: 'id, name', inFilters: { id: groupIds } }
	);
	return new Map(
		rows
			.filter((row): row is { id: string; name: string } => typeof row.name === 'string')
			.map((row) => [row.id, row.name])
	);
}
