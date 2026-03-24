import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore } from './inMemory';
import { createScopedDataStore } from './scopedDataStore';
import type { GroupScopeRule } from '$lib/server/core/ports';

const ORG = 'org-1';
const GROUP_A = 'group-a';
const GROUP_B = 'group-b';

function seedTestData(store: ReturnType<typeof createInMemoryDataStore>) {
	// Personnel in different groups
	store.seed('personnel', [
		{ id: 'p-1', organization_id: ORG, name: 'Alice', group_id: GROUP_A },
		{ id: 'p-2', organization_id: ORG, name: 'Bob', group_id: GROUP_B },
		{ id: 'p-3', organization_id: ORG, name: 'Carol', group_id: GROUP_A }
	]);

	// Training records linked to personnel
	store.seed('training_records', [
		{ id: 'tr-1', organization_id: ORG, personnel_id: 'p-1', course: 'First Aid' },
		{ id: 'tr-2', organization_id: ORG, personnel_id: 'p-2', course: 'Weapons' },
		{ id: 'tr-3', organization_id: ORG, personnel_id: 'p-3', course: 'First Aid' }
	]);
}

const scopeRules = new Map<string, GroupScopeRule>([
	['personnel', { type: 'group', groupColumn: 'group_id' }],
	['training_records', { type: 'personnel', personnelColumn: 'personnel_id' }]
]);

describe('ScopedDataStore', () => {
	describe('when scopedGroupId is null (admin/owner)', () => {
		it('returns the inner store unchanged', () => {
			const inner = createInMemoryDataStore();
			const scoped = createScopedDataStore(inner, null, scopeRules);

			expect(scoped).toBe(inner);
		});
	});

	describe('when scopedGroupId is set (scoped member)', () => {
		describe('group-scoped table (personnel)', () => {
			it('findMany only returns personnel in the scoped group', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const results = await scoped.findMany<{ id: string; name: string }>('personnel', ORG);

				expect(results).toHaveLength(2);
				expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['Alice', 'Carol']));
			});

			it('findOne only returns personnel in the scoped group', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const alice = await scoped.findOne<{ id: string }>('personnel', ORG, { id: 'p-1' });
				expect(alice).not.toBeNull();

				const bob = await scoped.findOne<{ id: string }>('personnel', ORG, { id: 'p-2' });
				expect(bob).toBeNull();
			});

			it('findManyWithCount only counts personnel in the scoped group', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const result = await scoped.findManyWithCount<{ id: string }>('personnel', ORG);

				expect(result.data).toHaveLength(2);
				expect(result.count).toBe(2);
			});
		});

		describe('personnel-scoped table (training_records)', () => {
			it('findMany only returns records for personnel in the scoped group', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const results = await scoped.findMany<{ id: string; course: string }>('training_records', ORG);

				expect(results).toHaveLength(2);
				expect(results.map((r) => r.id)).toEqual(expect.arrayContaining(['tr-1', 'tr-3']));
			});

			it('findOne only returns records for personnel in the scoped group', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const tr1 = await scoped.findOne<{ id: string }>('training_records', ORG, { id: 'tr-1' });
				expect(tr1).not.toBeNull();

				const tr2 = await scoped.findOne<{ id: string }>('training_records', ORG, { id: 'tr-2' });
				expect(tr2).toBeNull();
			});
		});

		describe('table with no scope rule', () => {
			it('passes through to inner store without filtering', async () => {
				const inner = createInMemoryDataStore();
				inner.seed('settings', [{ id: 's-1', organization_id: ORG, key: 'theme', value: 'dark' }]);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const results = await scoped.findMany<{ id: string }>('settings', ORG);
				expect(results).toHaveLength(1);
			});
		});

		describe('personnel ID caching', () => {
			it('caches in-scope personnel IDs across multiple queries', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				// First query — will fetch and cache personnel IDs
				await scoped.findMany('training_records', ORG);

				// Add a new person to GROUP_A after the cache is populated
				await inner.insert('personnel', ORG, { id: 'p-4', name: 'Dave', group_id: GROUP_A });

				// Second query should still use cached IDs (not see Dave's records)
				await inner.insert('training_records', ORG, { id: 'tr-4', personnel_id: 'p-4', course: 'New' });

				const results = await scoped.findMany<{ id: string }>('training_records', ORG);
				// tr-4 won't appear because 'p-4' is not in the cache
				expect(results).toHaveLength(2);
			});
		});

		describe('write operations pass through unchanged', () => {
			it('insert passes through to inner store', async () => {
				const inner = createInMemoryDataStore();
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const row = await scoped.insert<{ id: string; name: string }>('personnel', ORG, {
					name: 'New Person',
					group_id: GROUP_B
				});

				expect(row.name).toBe('New Person');

				// Verify it exists in inner store
				const found = await inner.findOne('personnel', ORG, { id: row.id });
				expect(found).not.toBeNull();
			});

			it('update passes through to inner store', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				await scoped.update('personnel', ORG, 'p-1', { name: 'Alice Updated' });

				const found = await inner.findOne<{ name: string }>('personnel', ORG, { id: 'p-1' });
				expect(found?.name).toBe('Alice Updated');
			});

			it('delete passes through to inner store', async () => {
				const inner = createInMemoryDataStore();
				seedTestData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				await scoped.delete('personnel', ORG, 'p-1');

				const found = await inner.findOne('personnel', ORG, { id: 'p-1' });
				expect(found).toBeNull();
			});
		});
	});
});
