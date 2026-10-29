import type { GroupCoverage } from '$lib/access/memberAccessShape';
import type { GroupPersistence, SelfPinPersistence } from './contracts';

/** `undefined` lets an Organization-wide actor read the whole catalog. */
export function visibleGroupIds(scopeSet: GroupCoverage, requestedIds?: string[]): string[] | undefined {
	if (scopeSet.kind === 'organization') return requestedIds;
	if (!requestedIds) return [...scopeSet.groupIds];
	return requestedIds.filter((id) => scopeSet.groupIds.includes(id));
}

/** Pins order the whole Organization's bands, so a Group-scoped reader's saved pins stay stored but unread. */
export async function listReaderPinnedGroupIds(ctx: {
	auth: { scopeSet: GroupCoverage };
	selfPins: Pick<SelfPinPersistence, 'listGroupIds'>;
}): Promise<string[]> {
	return ctx.auth.scopeSet.kind === 'organization' ? ctx.selfPins.listGroupIds() : [];
}

export function listGroupCatalog(ctx: { groups: Pick<GroupPersistence, 'listCatalog'> }) {
	return ctx.groups.listCatalog();
}
export function findGroupNamesByIds(ctx: { groups: Pick<GroupPersistence, 'findNamesByIds'> }, ids: string[]) {
	return ctx.groups.findNamesByIds(ids);
}
