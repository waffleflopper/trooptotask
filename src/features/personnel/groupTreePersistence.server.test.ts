import { expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

it('keeps Group names unique among siblings in the in-memory command port', async () => {
	const ctx = createTestContext();
	ctx.rawStore.seed('groups', [
		{ id: 'first', organization_id: ctx.auth.orgId, name: 'First', sort_order: 0, parent_id: null, depth: 1 },
		{ id: 'second', organization_id: ctx.auth.orgId, name: 'Second', sort_order: 1, parent_id: null, depth: 1 },
		{ id: 'alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0, parent_id: 'first', depth: 2 }
	]);
	const cousin = await ctx.groups.create({ name: 'Alpha', parentId: 'second' });
	expect(cousin).toMatchObject({ name: 'Alpha', parentId: 'second', depth: 2 });
	await expect(ctx.groups.create({ name: 'Alpha', parentId: 'first' })).rejects.toMatchObject({ status: 409 });
	const root = await ctx.groups.create({ name: 'Alpha' });
	expect(root.parentId).toBeNull();
	await expect(ctx.groups.rename('second', 'Alpha')).rejects.toMatchObject({ status: 409 });
});

it('deletes a subtree, preserves its People and reassigns them outside it', async () => {
	const ctx = createTestContext();
	ctx.rawStore.seed('groups', [
		{ id: 'root', organization_id: ctx.auth.orgId, name: 'Root', sort_order: 0, parent_id: null, depth: 1 },
		{ id: 'child', organization_id: ctx.auth.orgId, name: 'Child', sort_order: 0, parent_id: 'root', depth: 2 },
		{ id: 'leaf', organization_id: ctx.auth.orgId, name: 'Leaf', sort_order: 0, parent_id: 'child', depth: 3 },
		{ id: 'target', organization_id: ctx.auth.orgId, name: 'Target', sort_order: 1, parent_id: null, depth: 1 }
	]);
	ctx.rawStore.seed('personnel', [
		{ id: 'hq', organization_id: ctx.auth.orgId, group_id: 'root' },
		{ id: 'member', organization_id: ctx.auth.orgId, group_id: 'leaf' }
	]);
	await expect(ctx.groups.deleteWithReassignment('root', 'leaf')).rejects.toMatchObject({ status: 400 });
	expect(await ctx.groups.deleteWithReassignment('root', 'target')).toBe(2);
	expect((await ctx.groups.listCatalog()).map((group) => group.id)).toEqual(['target']);
	expect(await ctx.rawStore.findMany('personnel', ctx.auth.orgId)).toEqual([
		{ id: 'hq', organization_id: ctx.auth.orgId, group_id: 'target' },
		{ id: 'member', organization_id: ctx.auth.orgId, group_id: 'target' }
	]);
});
