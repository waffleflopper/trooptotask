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

		describe('pagination with personnel-scoped tables', () => {
			function seedPaginationData(store: ReturnType<typeof createInMemoryDataStore>) {
				store.seed('personnel', [
					{ id: 'p-1', organization_id: ORG, name: 'Alice', group_id: GROUP_A },
					{ id: 'p-2', organization_id: ORG, name: 'Bob', group_id: GROUP_B },
					{ id: 'p-3', organization_id: ORG, name: 'Carol', group_id: GROUP_A },
					{ id: 'p-4', organization_id: ORG, name: 'Dave', group_id: GROUP_A }
				]);

				// 4 records for group A personnel, 2 for group B
				store.seed('training_records', [
					{ id: 'tr-1', organization_id: ORG, personnel_id: 'p-1', course: 'A1' },
					{ id: 'tr-2', organization_id: ORG, personnel_id: 'p-2', course: 'B1' },
					{ id: 'tr-3', organization_id: ORG, personnel_id: 'p-3', course: 'A2' },
					{ id: 'tr-4', organization_id: ORG, personnel_id: 'p-1', course: 'A3' },
					{ id: 'tr-5', organization_id: ORG, personnel_id: 'p-2', course: 'B2' },
					{ id: 'tr-6', organization_id: ORG, personnel_id: 'p-4', course: 'A4' }
				]);
			}

			it('findMany with range on personnel-scoped table paginates after filtering', async () => {
				const inner = createInMemoryDataStore();
				seedPaginationData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				// Group A has 4 training records (tr-1, tr-3, tr-4, tr-6). Request first 2.
				const page1 = await scoped.findMany<{ id: string }>('training_records', ORG, undefined, {
					range: { from: 0, to: 1 }
				});

				expect(page1).toHaveLength(2);

				// Request next 2
				const page2 = await scoped.findMany<{ id: string }>('training_records', ORG, undefined, {
					range: { from: 2, to: 3 }
				});

				expect(page2).toHaveLength(2);

				// All 4 unique records across both pages
				const allIds = [...page1, ...page2].map((r) => r.id);
				expect(allIds).toHaveLength(4);
				expect(new Set(allIds).size).toBe(4);
			});

			it('findMany with limit on personnel-scoped table limits after filtering', async () => {
				const inner = createInMemoryDataStore();
				seedPaginationData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const results = await scoped.findMany<{ id: string }>('training_records', ORG, undefined, {
					limit: 2
				});

				expect(results).toHaveLength(2);
				// All results should be for group A personnel
				const groupAPersonnel = ['p-1', 'p-3', 'p-4'];
				for (const r of results) {
					const full = await inner.findOne<{ personnel_id: string }>('training_records', ORG, { id: r.id });
					expect(groupAPersonnel).toContain(full?.personnel_id);
				}
			});

			it('findManyWithCount with range returns correct count and paginated data', async () => {
				const inner = createInMemoryDataStore();
				seedPaginationData(inner);
				const scoped = createScopedDataStore(inner, GROUP_A, scopeRules);

				const result = await scoped.findManyWithCount<{ id: string }>('training_records', ORG, undefined, {
					range: { from: 0, to: 1 }
				});

				// Should return 2 items for this page, but count should be 4 (total matching)
				expect(result.data).toHaveLength(2);
				expect(result.count).toBe(4);
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
