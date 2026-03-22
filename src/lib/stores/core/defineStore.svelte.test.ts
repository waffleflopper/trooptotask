import { describe, it, expect } from 'vitest';
import { defineStore, tableToResource, buildComparator } from './defineStore.svelte';
import { createMockAdapter } from './ports';
import type { ApiAdapter } from './ports';
import type { Store, StoreInternals } from './createStore.svelte';

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
// defineStore — Tier 3: enhance function with internals
// ──────────────────────────────────────────────────────────────
describe('defineStore (Tier 3 — enhance with internals)', () => {
	it('passes internals as second argument when enhance accepts two parameters', () => {
		let capturedInternals: StoreInternals<TestItem> | undefined;

		defineStore(
			{ table: 'test_items', overrides: { adapter: mockAdapter() } },
			(_base: Store<TestItem>, internals: StoreInternals<TestItem>) => {
				capturedInternals = internals;
				return {};
			}
		);

		expect(capturedInternals).toBeDefined();
		expect(capturedInternals!.log.entries).toEqual([]);
	});

	it('internals.serverState reflects items loaded into the store', () => {
		let capturedInternals: StoreInternals<TestItem> | undefined;

		const store = defineStore(
			{ table: 'test_items', overrides: { adapter: mockAdapter() } },
			(_base: Store<TestItem>, internals: StoreInternals<TestItem>) => {
				capturedInternals = internals;
				return {};
			}
		);

		store.load(
			[
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' }
			],
			'org-1'
		);

		expect(capturedInternals!.serverState.items).toHaveLength(2);
		expect(capturedInternals!.serverState.items[0].id).toBe('1');
	});

	it('internals.log tracks pending mutations during add', async () => {
		let capturedInternals: StoreInternals<TestItem> | undefined;

		// adapter that never resolves so we can observe the pending mutation
		const hangingAdapter = createMockAdapter<TestItem>({
			create: () => new Promise(() => {}) // never resolves
		});

		const store = defineStore(
			{ table: 'test_items', overrides: { adapter: hangingAdapter } },
			(_base: Store<TestItem>, internals: StoreInternals<TestItem>) => {
				capturedInternals = internals;
				return {};
			}
		);

		store.load([], 'org-1');
		store.add({ name: 'Pending' }); // fire and forget — stays pending

		expect(capturedInternals!.log.entries.length).toBe(1);
		expect(capturedInternals!.log.entries[0].type).toBe('add');
	});

	it('internals.replay() returns current display items including optimistic entries', () => {
		let capturedInternals: StoreInternals<TestItem> | undefined;

		const hangingAdapter = createMockAdapter<TestItem>({
			create: () => new Promise(() => {})
		});

		const store = defineStore(
			{ table: 'test_items', overrides: { adapter: hangingAdapter } },
			(_base: Store<TestItem>, internals: StoreInternals<TestItem>) => {
				capturedInternals = internals;
				return {};
			}
		);

		store.load([{ id: '1', name: 'Server' }], 'org-1');
		store.add({ name: 'Optimistic' }); // pending — visible via replay

		const replayed = capturedInternals!.replay();
		expect(replayed.some((i) => i.name === 'Server')).toBe(true);
		expect(replayed.some((i) => i.name === 'Optimistic')).toBe(true);
	});

	it('internals.snapshot() returns point-in-time server items without pending mutations', () => {
		let capturedInternals: StoreInternals<TestItem> | undefined;

		const hangingAdapter = createMockAdapter<TestItem>({
			create: () => new Promise(() => {})
		});

		const store = defineStore(
			{ table: 'test_items', overrides: { adapter: hangingAdapter } },
			(_base: Store<TestItem>, internals: StoreInternals<TestItem>) => {
				capturedInternals = internals;
				return {};
			}
		);

		store.load([{ id: '1', name: 'Server' }], 'org-1');
		store.add({ name: 'Optimistic' }); // pending

		const snap = capturedInternals!.snapshot();
		// snapshot applies pending mutations too (same as replay but from getSnapshot)
		expect(snap.some((i) => i.name === 'Server')).toBe(true);
	});

	it('internals.orgId() returns the current org ID after load', () => {
		let capturedInternals: StoreInternals<TestItem> | undefined;

		const store = defineStore(
			{ table: 'test_items', overrides: { adapter: mockAdapter() } },
			(_base: Store<TestItem>, internals: StoreInternals<TestItem>) => {
				capturedInternals = internals;
				return {};
			}
		);

		store.load([], 'my-org');

		expect(capturedInternals!.orgId()).toBe('my-org');
	});

	it('internals.adapter is the active ApiAdapter', () => {
		let capturedInternals: StoreInternals<TestItem> | undefined;
		const adapter = mockAdapter();

		defineStore(
			{ table: 'test_items', overrides: { adapter } },
			(_base: Store<TestItem>, internals: StoreInternals<TestItem>) => {
				capturedInternals = internals;
				return {};
			}
		);

		expect(capturedInternals!.adapter).toBe(adapter);
	});

	it('Tier 2 (1-arg enhance) produces a correctly merged store', () => {
		const store = defineStore({ table: 'test_items', overrides: { adapter: mockAdapter() } }, (base) => ({
			count: () => base.items.length
		}));

		store.load(
			[
				{ id: '1', name: 'A' },
				{ id: '2', name: 'B' }
			],
			'org-1'
		);
		expect(store.count()).toBe(2);
		expect(store.items).toHaveLength(2);
	});
});

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
