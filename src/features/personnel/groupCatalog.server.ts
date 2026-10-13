import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { Group, GroupPersistence } from './contracts';

/** `undefined` lets an Organization-wide actor read the whole catalog. */
export function visibleGroupIds(scopeSet: ScopeSet, requestedIds?: string[]): string[] | undefined {
	if (scopeSet.kind === 'organization') return requestedIds;
	if (!requestedIds) return scopeSet.groupIds;
	return requestedIds.filter((id) => scopeSet.groupIds.includes(id));
}

/** Pins are stored by name, so a stale pin never restores a hidden or deleted Group. */
export function visiblePinnedGroupNames(pinnedNames: string[], groups: Pick<Group, 'name'>[]): string[] {
	const visible = new Set(groups.map((group) => group.name));
	return pinnedNames.filter((name) => visible.has(name));
}

export function listGroupCatalog(ctx: { groups: Pick<GroupPersistence, 'listCatalog'> }) {
	return ctx.groups.listCatalog();
}
export function findGroupNamesByIds(ctx: { groups: Pick<GroupPersistence, 'findNamesByIds'> }, ids: string[]) {
	return ctx.groups.findNamesByIds(ids);
}
