import type { GroupPersistence } from './contracts';
export function listGroupCatalog(
	ctx: { groups: Pick<GroupPersistence, 'listCatalog'> },
	options?: { groupIds?: string[] }
) {
	return ctx.groups.listCatalog(options);
}
export function findGroupNamesByIds(ctx: { groups: Pick<GroupPersistence, 'findNamesByIds'> }, ids: string[]) {
	return ctx.groups.findNamesByIds(ids);
}
