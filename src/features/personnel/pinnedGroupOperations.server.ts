import type { SelfPinPersistence, PinnedGroupResult } from './contracts';
export type { PinnedGroupResult } from './contracts';
interface PinnedGroupWriteContext {
	selfPins: Pick<SelfPinPersistence, 'insert' | 'removeName' | 'replaceNames'>;
	audit: { log(event: { action: string; resourceType: string }): void };
}

export async function replacePinnedGroups(
	ctx: PinnedGroupWriteContext,
	groups: string[]
): Promise<{ success: true; groups: string[] }> {
	await ctx.selfPins.replaceNames(groups);
	ctx.audit.log({ action: 'pinned_group.replaced', resourceType: 'pinned_group' });
	return { success: true, groups };
}

export async function pinGroup(
	ctx: PinnedGroupWriteContext,
	data: { groupName: string; sortOrder?: number }
): Promise<PinnedGroupResult> {
	const row = await ctx.selfPins.insert(data);
	ctx.audit.log({ action: 'pinned_group.created', resourceType: 'pinned_group' });
	return row;
}

export async function unpinGroup(ctx: PinnedGroupWriteContext, groupName: string): Promise<{ success: true }> {
	await ctx.selfPins.removeName(groupName);
	ctx.audit.log({ action: 'pinned_group.deleted', resourceType: 'pinned_group' });
	return { success: true };
}
