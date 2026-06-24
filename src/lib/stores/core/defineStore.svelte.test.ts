import { describe, it, expect } from 'vitest';
import { defineStore, tableToResource, buildComparator } from './defineStore.svelte';
import { createMockAdapter } from './ports';
import type { ApiAdapter } from './ports';

interface TestItem {
	id: string;
	name: string;
	rank?: number;
	group?: string | null;
}

function mockAdapter(overrides: Partial<ApiAdapter<TestItem>> = {}): ApiAdapter<TestItem> {
	return createMockAdapter<TestItem>({
		create: async (data) => ({ id: 'server-1', ...data }) as TestItem,
		update: async (id, data) => ({ id, name: 'default', ...data }) as TestItem,
		remove: async () => 'deleted',
		...overrides
	});
}

// ──────────────────────────────────────────────────────────────
// tableToResource
// ──────────────────────────────────────────────────────────────
describe('tableToResource', () => {
	it('replaces underscores with hyphens', () => {
		expect(tableToResource('training_types')).toBe('training-types');
	});

	it('handles tables with multiple underscores', () => {
		expect(tableToResource('some_long_table_name')).toBe('some-long-table-name');
	});

	it('returns unchanged string when no underscores', () => {
		expect(tableToResource('personnel')).toBe('personnel');
	});
});

// ──────────────────────────────────────────────────────────────
// buildComparator
// ──────────────────────────────────────────────────────────────
describe('buildComparator', () => {
	it('returns undefined when orderBy is empty', () => {
		expect(buildComparator([])).toBeUndefined();
	});

	it('sorts by a single numeric field ascending', () => {
		const cmp = buildComparator<TestItem>([{ field: 'rank', ascending: true }])!;
		const items: TestItem[] = [
			{ id: '1', name: 'A', rank: 3 },
			{ id: '2', name: 'B', rank: 1 },
			{ id: '3', name: 'C', rank: 2 }
		];
		expect([...items].sort(cmp).map((i) => i.rank)).toEqual([1, 2, 3]);
	});

	it('sorts by a single numeric field descending', () => {
		const cmp = buildComparator<TestItem>([{ field: 'rank', ascending: false }])!;
		const items: TestItem[] = [
			{ id: '1', name: 'A', rank: 1 },
			{ id: '2', name: 'B', rank: 3 },
			{ id: '3', name: 'C', rank: 2 }
		];
		expect([...items].sort(cmp).map((i) => i.rank)).toEqual([3, 2, 1]);
	});

	it('sorts by a string field using localeCompare', () => {
		const cmp = buildComparator<TestItem>([{ field: 'name', ascending: true }])!;
		const items: TestItem[] = [
			{ id: '1', name: 'Bravo' },
			{ id: '2', name: 'alpha' },
			{ id: '3', name: 'Charlie' }
		];
		// localeCompare is case-insensitive in most locales, order: alpha, Bravo, Charlie
		const sorted = [...items].sort(cmp).map((i) => i.name);
		expect(sorted.indexOf('alpha')).toBeLessThan(sorted.indexOf('Bravo'));
		expect(sorted.indexOf('Bravo')).toBeLessThan(sorted.indexOf('Charlie'));
	});

	it('falls back to second field when first field values are equal', () => {
		const cmp = buildComparator<TestItem>([
			{ field: 'group', ascending: true },
			{ field: 'rank', ascending: true }
		])!;
		const items: TestItem[] = [
			{ id: '1', name: 'A', group: 'alpha', rank: 3 },
			{ id: '2', name: 'B', group: 'alpha', rank: 1 },
			{ id: '3', name: 'C', group: 'bravo', rank: 2 }
		];
		const sorted = [...items].sort(cmp);
		expect(sorted[0].id).toBe('2'); // alpha, rank 1
		expect(sorted[1].id).toBe('1'); // alpha, rank 3
		expect(sorted[2].id).toBe('3'); // bravo, rank 2
	});

	it('sorts nulls last when ascending', () => {
		const cmp = buildComparator<TestItem>([{ field: 'group', ascending: true }])!;
		const items: TestItem[] = [
			{ id: '1', name: 'A', group: null },
			{ id: '2', name: 'B', group: 'alpha' },
			{ id: '3', name: 'C', group: null }
		];
		const sorted = [...items].sort(cmp);
		expect(sorted[0].group).toBe('alpha');
		expect(sorted[1].group).toBeNull();
		expect(sorted[2].group).toBeNull();
	});

	it('sorts nulls first when descending', () => {
		const cmp = buildComparator<TestItem>([{ field: 'group', ascending: false }])!;
		const items: TestItem[] = [
			{ id: '1', name: 'A', group: 'alpha' },
			{ id: '2', name: 'B', group: null },
			{ id: '3', name: 'C', group: 'bravo' }
		];
		const sorted = [...items].sort(cmp);
		expect(sorted[0].group).toBeNull();
	});
});

// ──────────────────────────────────────────────────────────────
// defineStore — Tier 2: enhance function
// ──────────────────────────────────────────────────────────────
describe('defineStore (Tier 2 — enhance)', () => {
	it('enhance function can call base methods directly', async () => {
		const store = defineStore({ table: 'test_items', overrides: { adapter: mockAdapter() } }, (base) => ({
			addNamed: (name: string) => base.add({ name })
		}));

		store.load([], 'org-1');
		const result = await store.addNamed('Alpha');

		expect(result).not.toBeNull();
		expect(store.items.some((i) => i.name === 'Alpha' || i.id === 'server-1')).toBe(true);
	});

	it('getters from base store work correctly on enhanced store', () => {
		const store = defineStore(
			{
				table: 'test_items',
				orderBy: [{ field: 'rank', ascending: true }],
				overrides: { adapter: mockAdapter() }
			},
			(base) => ({ count: () => base.items.length })
		);

		store.load(
			[
				{ id: '1', name: 'A', rank: 3 },
				{ id: '2', name: 'B', rank: 1 }
			],
			'org-1'
		);

		// `items` getter should be live and sorted
		expect(store.items.map((i) => i.rank)).toEqual([1, 3]);
		expect(store.count()).toBe(2);
	});

	it('enhanced method overrides base method with same name', async () => {
		let customAddCalled = false;
		const store = defineStore({ table: 'test_items', overrides: { adapter: mockAdapter() } }, (_base) => ({
			add: async (_data: Omit<TestItem, 'id'>) => {
				customAddCalled = true;
				return null;
			}
		}));

		store.load([], 'org-1');
		await store.add({ name: 'New' });

		expect(customAddCalled).toBe(true);
	});

	it('returns base methods plus extension methods', () => {
		const store = defineStore({ table: 'test_items', overrides: { adapter: mockAdapter() } }, (base) => ({
			findByName: (name: string) => base.find((item) => item.name === name)
		}));

		store.load([{ id: '1', name: 'Alpha' }], 'org-1');

		expect(store.items).toEqual([{ id: '1', name: 'Alpha' }]);
		expect(store.findByName('Alpha')).toEqual({ id: '1', name: 'Alpha' });
		expect(store.findByName('Missing')).toBeUndefined();
	});
});

// ──────────────────────────────────────────────────────────────
// defineStore — tracer bullet + integration
// ──────────────────────────────────────────────────────────────
describe('defineStore', () => {
	it('returns a Store that loads and exposes items', () => {
		const store = defineStore<TestItem>({
			table: 'test_items',
			overrides: { adapter: mockAdapter() }
		});

		store.load([{ id: '1', name: 'Alpha' }], 'org-1');

		expect(store.items).toEqual([{ id: '1', name: 'Alpha' }]);
	});

	it('applies sort from orderBy when provided', () => {
		const store = defineStore<TestItem>({
			table: 'test_items',
			orderBy: [{ field: 'rank', ascending: true }],
			overrides: { adapter: mockAdapter() }
		});

		store.load(
			[
				{ id: '1', name: 'A', rank: 3 },
				{ id: '2', name: 'B', rank: 1 },
				{ id: '3', name: 'C', rank: 2 }
			],
			'org-1'
		);

		expect(store.items.map((i) => i.rank)).toEqual([1, 2, 3]);
	});

	it('does not sort when orderBy is omitted', () => {
		const store = defineStore<TestItem>({
			table: 'test_items',
			overrides: { adapter: mockAdapter() }
		});

		const items: TestItem[] = [
			{ id: '3', name: 'C', rank: 3 },
			{ id: '1', name: 'A', rank: 1 },
			{ id: '2', name: 'B', rank: 2 }
		];
		store.load(items, 'org-1');

		// No sort applied — original order preserved
		expect(store.items.map((i) => i.id)).toEqual(['3', '1', '2']);
	});

	it('passes overrides through to the underlying store (beforeAdd)', async () => {
		let beforeAddCalled = false;
		const store = defineStore<TestItem>({
			table: 'test_items',
			overrides: {
				adapter: mockAdapter(),
				beforeAdd: (items, _data) => {
					beforeAddCalled = true;
					return { items };
				}
			}
		});

		store.load([], 'org-1');
		await store.add({ name: 'New Item' });

		expect(beforeAddCalled).toBe(true);
	});
});
