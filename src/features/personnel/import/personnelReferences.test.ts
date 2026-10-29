import { afterEach, expect, it, vi } from 'vitest';
import { groupCatalogHydration, groupManagementStore } from '../stores/groups.svelte';
import { groupReference } from './personnelReferences';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}) }));
afterEach(() => vi.unstubAllGlobals());

it('creates missing import Groups at the root while deduplicating only existing roots', async () => {
	groupCatalogHydration.load(
		[
			{ id: 'platoon', name: 'Platoon', sortOrder: 0, parentId: null, depth: 1 },
			{ id: 'team', name: 'Alpha', sortOrder: 0, parentId: 'platoon', depth: 2 }
		],
		'org-1'
	);
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => Response.json({ id: 'root-alpha', ...JSON.parse(init.body) }))
	);
	const reference = groupReference(groupManagementStore.items, { canCreate: true, allowUnassigned: true });
	if (!reference.create) throw new Error('Expected an import creation command');
	expect(await reference.create('Alpha')).toMatchObject({ kind: 'created', option: { id: 'root-alpha' } });
	expect(await reference.create(' alpha ')).toMatchObject({ kind: 'created', option: { id: 'root-alpha' } });
	expect(new Map(groupManagementStore.items.map((group) => [group.id, group.parentId]))).toEqual(
		new Map([
			['platoon', null],
			['team', 'platoon'],
			['root-alpha', null]
		])
	);
});
