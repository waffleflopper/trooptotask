import { fail } from '$lib/errors';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { SelfPinPersistence, PinnedGroupResult } from './contracts';
export type { PinnedGroupResult } from './contracts';
interface PinnedGroupWriteContext {
	auth: { scopeSet: ScopeSet };
	selfPins: Pick<SelfPinPersistence, 'insert' | 'remove'>;
	audit: { log(event: { action: string; resourceType: string }): void | Promise<void> };
}

/** Pins order the whole Organization's bands, so only Organization-wide readers keep them. */
function requireOrganizationWideReader(ctx: PinnedGroupWriteContext) {
	if (ctx.auth.scopeSet.kind !== 'organization') fail(403, 'Only Organization-wide members can pin Groups.');
}

export async function pinGroup(
	ctx: PinnedGroupWriteContext,
	data: { groupId: string; sortOrder?: number }
): Promise<PinnedGroupResult> {
	requireOrganizationWideReader(ctx);
	const row = await ctx.selfPins.insert(data);
	await ctx.audit.log({ action: 'pinned_group.created', resourceType: 'pinned_group' });
	return row;
}

export async function unpinGroup(ctx: PinnedGroupWriteContext, groupId: string): Promise<{ success: true }> {
	requireOrganizationWideReader(ctx);
	await ctx.selfPins.remove(groupId);
	await ctx.audit.log({ action: 'pinned_group.deleted', resourceType: 'pinned_group' });
	return { success: true };
}
