import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore } from './createStore.svelte';
import { createMockAdapter } from './ports';
import type { ApiAdapter, BatchApiAdapter } from './ports';
import type { BeforeAddHook } from './optimistic';

interface TestItem {
	id: string;
	name: string;
	sortOrder?: number;
}

describe('createStore', () => {
	function makeAdapter(overrides: Partial<ApiAdapter<TestItem>> = {}): ApiAdapter<TestItem> {
		return createMockAdapter<TestItem>({
			create: async (data) => ({ id: 'server-1', ...data }) as TestItem,
			update: async (id, data) => ({ id, name: 'default', ...data }) as TestItem,
			remove: async () => 'deleted',
			...overrides
		});
	}

	function makeStore(
		config: {
			adapterOverrides?: Partial<ApiAdapter<TestItem>>;
			beforeAdd?: BeforeAddHook<TestItem>;
		} = {}
	) {
		return createStore<TestItem>({
			resource: 'test-items',
			adapter: makeAdapter(config.adapterOverrides),
			beforeAdd: config.beforeAdd
		});
	}

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('load + items', () => {
		it('should make loaded items available via items', () => {
			const store = makeStore();
			const items: TestItem[] = [
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' }
			];

			store.load(items, 'org-1');

			expect(store.items).toEqual(items);
		});

		it('should return empty array before load', () => {
			const store = makeStore();
			expect(store.items).toEqual([]);
		});
	});

	describe('add', () => {
		it('should add item optimistically then replace with server response', async () => {
			const serverItem: TestItem = { id: 'server-1', name: 'Alpha' };
			const store = makeStore({
				adapterOverrides: { create: async () => serverItem }
			});
			store.load([], 'org-1');

			const result = await store.add({ name: 'Alpha' });

			expect(result).toEqual(serverItem);
			expect(store.items).toEqual([serverItem]);
		});

		it('should rollback on adapter error', async () => {
			const existing: TestItem = { id: '1', name: 'Existing' };
			const store = makeStore({
				adapterOverrides: {
					create: async () => {
						throw new Error('Network error');
					}
				}
			});
			store.load([existing], 'org-1');

			const result = await store.add({ name: 'New' });

			expect(result).toBeNull();
			expect(store.items).toEqual([existing]);
		});
	});

	describe('update', () => {
		it('should update item optimistically then replace with server response', async () => {
			const serverItem: TestItem = { id: '1', name: 'Updated' };
			const store = makeStore({
				adapterOverrides: { update: async () => serverItem }
			});
			store.load([{ id: '1', name: 'Old' }], 'org-1');

			const result = await store.update('1', { name: 'Updated' });

			expect(result).toBe(true);
			expect(store.items).toEqual([serverItem]);
		});

		it('should rollback on adapter error', async () => {
			const original: TestItem = { id: '1', name: 'Original' };
			const store = makeStore({
				adapterOverrides: {
					update: async () => {
						throw new Error('fail');
					}
				}
			});
			store.load([original], 'org-1');

			const result = await store.update('1', { name: 'Changed' });

			expect(result).toBe(false);
			expect(store.items).toEqual([original]);
		});

		it('should return false for non-existent ID', async () => {
			const store = makeStore();
			store.load([], 'org-1');

			const result = await store.update('nonexistent', { name: 'Nope' });

			expect(result).toBe(false);
		});
	});

	describe('remove', () => {
		it('should remove item optimistically and return deleted', async () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);

			const result = await store.remove('1');

			expect(result).toBe('deleted');
			expect(store.items).toEqual([{ id: '2', name: 'Bravo' }]);
		});

		it('should handle approval_required and restore item', async () => {
			const item: TestItem = { id: '1', name: 'Alpha' };
			const store = makeStore({
				adapterOverrides: { remove: async () => 'approval_required' }
			});
			store.load([item], 'org-1');

			const result = await store.remove('1');

			expect(result).toBe('approval_required');
			expect(store.items).toEqual([item]);
		});

		it('should rollback on error and return error', async () => {
			const item: TestItem = { id: '1', name: 'Alpha' };
			const store = makeStore({
				adapterOverrides: { remove: async () => 'error' }
			});
			store.load([item], 'org-1');

			const result = await store.remove('1');

			expect(result).toBe('error');
			expect(store.items).toEqual([item]);
		});

		it('should return error for non-existent ID', async () => {
			const store = makeStore();
			store.load([], 'org-1');

			const result = await store.remove('nonexistent');

			expect(result).toBe('error');
		});
	});

	describe('removeBool', () => {
		it('should return true on successful delete', async () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			const result = await store.removeBool('1');

			expect(result).toBe(true);
			expect(store.items).toEqual([]);
		});

		it('should return false on error', async () => {
			const store = makeStore({
				adapterOverrides: { remove: async () => 'error' }
			});
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			const result = await store.removeBool('1');

			expect(result).toBe(false);
			expect(store.items).toEqual([{ id: '1', name: 'Alpha' }]);
		});
	});

	describe('beforeAdd (upsert)', () => {
		it('should use beforeAdd to filter items before insert', async () => {
			const serverItem: TestItem = { id: '2', name: 'Alpha' };
			const store = makeStore({
				adapterOverrides: { create: async () => serverItem },
				beforeAdd(items, data) {
					const displaced = items.find((i) => i.name === data.name);
					return {
						items: items.filter((i) => i.name !== data.name),
						displaced
					};
				}
			});
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			const result = await store.add({ name: 'Alpha' });

			expect(result).toEqual(serverItem);
			expect(store.items).toEqual([serverItem]);
		});

		it('should restore displaced item on rollback', async () => {
			const displaced: TestItem = { id: '1', name: 'Alpha' };
			const store = makeStore({
				adapterOverrides: {
					create: async () => {
						throw new Error('fail');
					}
				},
				beforeAdd(items, data) {
					const found = items.find((i) => i.name === data.name);
					return {
						items: items.filter((i) => i.name !== data.name),
						displaced: found
					};
				}
			});
			store.load([displaced], 'org-1');

			const result = await store.add({ name: 'Alpha' });

			expect(result).toBeNull();
			expect(store.items).toEqual([displaced]);
		});
	});

	describe('load during in-flight mutations (issue #113)', () => {
		it('should not clobber optimistic add when load is called mid-flight', async () => {
			let resolveCreate!: (value: TestItem) => void;
			const createPromise = new Promise<TestItem>((resolve) => {
				resolveCreate = resolve;
			});

			const store = makeStore({
				adapterOverrides: { create: () => createPromise }
			});
			store.load([{ id: '1', name: 'Existing' }], 'org-1');

			const addPromise = store.add({ name: 'New' });

			// Optimistic item should be present
			expect(store.items.length).toBe(2);
			expect(store.items.some((i) => i.name === 'New')).toBe(true);

			// Stale load arrives — should be blocked
			store.load([{ id: '1', name: 'Existing' }], 'org-1');
			expect(store.items.some((i) => i.name === 'New')).toBe(true);

			// Resolve
			resolveCreate({ id: 'server-1', name: 'New' });
			await addPromise;

			expect(store.items).toEqual([
				{ id: '1', name: 'Existing' },
				{ id: 'server-1', name: 'New' }
			]);
		});

		it('should not clobber optimistic update when load is called mid-flight', async () => {
			let resolveUpdate!: (value: TestItem) => void;
			const updatePromise = new Promise<TestItem>((resolve) => {
				resolveUpdate = resolve;
			});

			const store = makeStore({
				adapterOverrides: { update: () => updatePromise }
			});
			store.load([{ id: '1', name: 'Original' }], 'org-1');

			const updateP = store.update('1', { name: 'Updated' });

			expect(store.items[0].name).toBe('Updated');

			// Stale load
			store.load([{ id: '1', name: 'Original' }], 'org-1');
			expect(store.items[0].name).toBe('Updated');

			resolveUpdate({ id: '1', name: 'Updated' });
			await updateP;

			expect(store.items[0].name).toBe('Updated');
		});

		it('should not clobber optimistic remove when load is called mid-flight', async () => {
			let resolveRemove!: (value: 'deleted') => void;
			const removePromise = new Promise<'deleted'>((resolve) => {
				resolveRemove = resolve;
			});

			const store = makeStore({
				adapterOverrides: { remove: () => removePromise }
			});
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);

			const removeP = store.remove('1');

			expect(store.items.length).toBe(1);
			expect(store.items[0].id).toBe('2');

			// Stale load
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);
			expect(store.items.length).toBe(1);

			resolveRemove('deleted');
			await removeP;

			expect(store.items).toEqual([{ id: '2', name: 'Bravo' }]);
		});

		it('should allow load when org changes even during in-flight mutation', async () => {
			let resolveCreate!: (value: TestItem) => void;
			const createPromise = new Promise<TestItem>((resolve) => {
				resolveCreate = resolve;
			});

			const store = makeStore({
				adapterOverrides: { create: () => createPromise }
			});
			store.load([{ id: '1', name: 'Existing' }], 'org-1');

			store.add({ name: 'New' });

			// Different org — should go through
			store.load([{ id: '10', name: 'Other Org Item' }], 'org-2');

			expect(store.items).toEqual([{ id: '10', name: 'Other Org Item' }]);

			resolveCreate({ id: 'server-1', name: 'New' });
		});

		it('should allow load after all mutations complete', async () => {
			const serverItem: TestItem = { id: 'server-1', name: 'New' };
			const store = makeStore({
				adapterOverrides: { create: async () => serverItem }
			});
			store.load([{ id: '1', name: 'Existing' }], 'org-1');

			await store.add({ name: 'New' });

			store.load(
				[
					{ id: '1', name: 'Existing' },
					{ id: 'server-1', name: 'New' }
				],
				'org-1'
			);

			expect(store.items).toEqual([
				{ id: '1', name: 'Existing' },
				{ id: 'server-1', name: 'New' }
			]);
		});
	});

	describe('busy', () => {
		it('should be false when no mutations in flight', () => {
			const store = makeStore();
			store.load([], 'org-1');
			expect(store.busy).toBe(false);
		});

		it('should be true during in-flight mutation', async () => {
			let resolveCreate!: (value: TestItem) => void;
			const createPromise = new Promise<TestItem>((resolve) => {
				resolveCreate = resolve;
			});

			const store = makeStore({
				adapterOverrides: { create: () => createPromise }
			});
			store.load([], 'org-1');

			const addPromise = store.add({ name: 'New' });
			expect(store.busy).toBe(true);

			resolveCreate({ id: 'server-1', name: 'New' });
			await addPromise;
			expect(store.busy).toBe(false);
		});
	});

	describe('addBatch', () => {
		function makeBatchAdapter(overrides: Partial<BatchApiAdapter<TestItem>> = {}): BatchApiAdapter<TestItem> {
			return {
				create: async (data) => ({ id: 'server-1', ...data }) as TestItem,
				update: async (id, data) => ({ id, name: 'default', ...data }) as TestItem,
				remove: async () => 'deleted',
				createBatch: async (items) => items.map((d, i) => ({ id: `server-${i}`, ...d }) as TestItem),
				...overrides
			};
		}

		it('should add multiple items optimistically then replace with server results', async () => {
			const serverItems: TestItem[] = [
				{ id: 'server-1', name: 'Alpha' },
				{ id: 'server-2', name: 'Bravo' }
			];
			const batchAdapter = makeBatchAdapter({ createBatch: async () => serverItems });
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: batchAdapter,
				batchAdapter
			});
			store.load([], 'org-1');

			const result = await store.addBatch([{ name: 'Alpha' }, { name: 'Bravo' }]);

			expect(result).toEqual(serverItems);
			expect(store.items).toEqual(serverItems);
		});

		it('should rollback all temp items on batch create failure', async () => {
			const existing: TestItem = { id: '1', name: 'Existing' };
			const batchAdapter = makeBatchAdapter({
				createBatch: async () => {
					throw new Error('batch fail');
				}
			});
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: batchAdapter,
				batchAdapter
			});
			store.load([existing], 'org-1');

			const result = await store.addBatch([{ name: 'New1' }, { name: 'New2' }]);

			expect(result).toEqual([]);
			expect(store.items).toEqual([existing]);
		});

		it('should fall back to sequential creates when no batchAdapter', async () => {
			const store = makeStore({
				adapterOverrides: {
					create: async (data) => ({ id: `s-${(data as TestItem).name}`, ...data }) as TestItem
				}
			});
			store.load([], 'org-1');

			const result = await store.addBatch([{ name: 'A' }, { name: 'B' }]);

			expect(result).toHaveLength(2);
			expect(store.items).toHaveLength(2);
		});

		it('should set busy during batch add', async () => {
			let resolveCreate!: (value: TestItem[]) => void;
			const createPromise = new Promise<TestItem[]>((resolve) => {
				resolveCreate = resolve;
			});

			const batchAdapter = makeBatchAdapter({ createBatch: () => createPromise });
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: batchAdapter,
				batchAdapter
			});
			store.load([], 'org-1');

			const addPromise = store.addBatch([{ name: 'A' }]);
			expect(store.busy).toBe(true);

			resolveCreate([{ id: 'server-1', name: 'A' }]);
			await addPromise;
			expect(store.busy).toBe(false);
		});
	});

	describe('removeBatch', () => {
		function makeBatchAdapter(overrides: Partial<BatchApiAdapter<TestItem>> = {}): BatchApiAdapter<TestItem> {
			return {
				create: async (data) => ({ id: 'server-1', ...data }) as TestItem,
				update: async (id, data) => ({ id, name: 'default', ...data }) as TestItem,
				remove: async () => 'deleted',
				createBatch: async (items) => items.map((d, i) => ({ id: `server-${i}`, ...d }) as TestItem),
				removeBatch: async () => true,
				...overrides
			};
		}

		it('should remove multiple items optimistically', async () => {
			const items: TestItem[] = [
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			];
			const batchAdapter = makeBatchAdapter();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: batchAdapter,
				batchAdapter
			});
			store.load(items, 'org-1');

			const result = await store.removeBatch(['1', '3']);

			expect(result).toBe(true);
			expect(store.items).toEqual([{ id: '2', name: 'Bravo' }]);
		});

		it('should rollback on batch remove failure', async () => {
			const items: TestItem[] = [
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' }
			];
			const batchAdapter = makeBatchAdapter({
				removeBatch: async () => {
					throw new Error('batch fail');
				}
			});
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: batchAdapter,
				batchAdapter
			});
			store.load(items, 'org-1');

			const result = await store.removeBatch(['1']);

			expect(result).toBe(false);
			expect(store.items).toHaveLength(2);
			expect(store.items.find((i) => i.id === '1')).toEqual({ id: '1', name: 'Alpha' });
			expect(store.items.find((i) => i.id === '2')).toEqual({ id: '2', name: 'Bravo' });
		});

		it('should fall back to sequential removes when no batchAdapter.removeBatch', async () => {
			const items: TestItem[] = [
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			];
			const store = makeStore();
			store.load(items, 'org-1');

			const result = await store.removeBatch(['1', '3']);

			expect(result).toBe(true);
			expect(store.items).toEqual([{ id: '2', name: 'Bravo' }]);
		});
	});

	describe('mergeBatchResults', () => {
		it('should merge inserted items into store', () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'Existing' }], 'org-1');

			store.mergeBatchResults([{ id: '2', name: 'New' }]);

			expect(store.items).toEqual([
				{ id: '1', name: 'Existing' },
				{ id: '2', name: 'New' }
			]);
		});

		it('should merge inserted and updated items', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Old' },
					{ id: '2', name: 'Keep' }
				],
				'org-1'
			);

			store.mergeBatchResults([{ id: '3', name: 'New' }], [{ id: '1', name: 'Updated' }]);

			expect(store.items).toEqual([
				{ id: '1', name: 'Updated' },
				{ id: '2', name: 'Keep' },
				{ id: '3', name: 'New' }
			]);
		});
	});

	describe('removeLocalWhere', () => {
		it('should remove items matching predicate without API call', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' },
					{ id: '3', name: 'Alpha' }
				],
				'org-1'
			);

			store.removeLocalWhere((i) => i.name === 'Alpha');

			expect(store.items).toEqual([{ id: '2', name: 'Bravo' }]);
		});

		it('should do nothing when no items match', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);

			store.removeLocalWhere((i) => i.name === 'Charlie');

			expect(store.items).toEqual([
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' }
			]);
		});

		it('should remove all items when all match', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Alpha' }
				],
				'org-1'
			);

			store.removeLocalWhere((i) => i.name === 'Alpha');

			expect(store.items).toEqual([]);
		});
	});

	describe('getById / filter / find', () => {
		it('should find item by id', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);

			expect(store.getById('1')).toEqual({ id: '1', name: 'Alpha' });
			expect(store.getById('nonexistent')).toBeUndefined();
		});

		it('should filter items by predicate', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' },
					{ id: '3', name: 'Alpha' }
				],
				'org-1'
			);

			expect(store.filter((i) => i.name === 'Alpha')).toEqual([
				{ id: '1', name: 'Alpha' },
				{ id: '3', name: 'Alpha' }
			]);
		});

		it('should find first item matching predicate', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);

			expect(store.find((i) => i.name === 'Bravo')).toEqual({ id: '2', name: 'Bravo' });
			expect(store.find((i) => i.name === 'Charlie')).toBeUndefined();
		});
	});

	describe('updateLocalWhere', () => {
		it('should update items matching predicate without API call', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' },
					{ id: '3', name: 'Alpha' }
				],
				'org-1'
			);

			store.updateLocalWhere(
				(i) => i.name === 'Alpha',
				(i) => ({ ...i, name: 'Updated' })
			);

			expect(store.items).toEqual([
				{ id: '1', name: 'Updated' },
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Updated' }
			]);
		});

		it('should do nothing when no items match', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);

			store.updateLocalWhere(
				(i) => i.name === 'Charlie',
				(i) => ({ ...i, name: 'Nope' })
			);

			expect(store.items).toEqual([
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' }
			]);
		});
	});

	describe('appendLocal', () => {
		it('should append items without API call', () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			store.appendLocal([
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			]);

			expect(store.items).toEqual([
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			]);
		});

		it('should handle empty append', () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			store.appendLocal([]);

			expect(store.items).toEqual([{ id: '1', name: 'Alpha' }]);
		});
	});

	describe('sort config', () => {
		function makeSortedStore(adapterOverrides: Partial<ApiAdapter<TestItem>> = {}) {
			return createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter(adapterOverrides),
				sort: (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
			});
		}

		it('should return items sorted via sort comparator', () => {
			const store = makeSortedStore();
			store.load(
				[
					{ id: '1', name: 'Charlie', sortOrder: 3 },
					{ id: '2', name: 'Alpha', sortOrder: 1 },
					{ id: '3', name: 'Bravo', sortOrder: 2 }
				],
				'org-1'
			);

			expect(store.items.map((i) => i.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});

		it('should expose rawItems in insertion order (unsorted)', () => {
			const store = makeSortedStore();
			store.load(
				[
					{ id: '1', name: 'Charlie', sortOrder: 3 },
					{ id: '2', name: 'Alpha', sortOrder: 1 },
					{ id: '3', name: 'Bravo', sortOrder: 2 }
				],
				'org-1'
			);

			expect(store.rawItems.map((i) => i.name)).toEqual(['Charlie', 'Alpha', 'Bravo']);
		});

		it('should sort items after add', async () => {
			const store = makeSortedStore({
				create: async (data) => ({ id: 'server-1', ...data }) as TestItem
			});
			store.load(
				[
					{ id: '1', name: 'Alpha', sortOrder: 1 },
					{ id: '2', name: 'Charlie', sortOrder: 3 }
				],
				'org-1'
			);

			await store.add({ name: 'Bravo', sortOrder: 2 });

			expect(store.items.map((i) => i.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});

		it('should sort items after update', async () => {
			const store = makeSortedStore({
				update: async (id, data) => ({ id, name: 'Alpha', sortOrder: 1, ...data }) as TestItem
			});
			store.load(
				[
					{ id: '1', name: 'Alpha', sortOrder: 2 },
					{ id: '2', name: 'Bravo', sortOrder: 1 }
				],
				'org-1'
			);

			// Before update: sorted = [Bravo(1), Alpha(2)]
			expect(store.items[0].name).toBe('Bravo');

			await store.update('1', { sortOrder: 0 });

			// After update: Alpha sortOrder=0, Bravo sortOrder=1
			expect(store.items[0].name).toBe('Alpha');
		});

		it('rawItems should be unsorted for store without sort config', () => {
			const store = makeStore();
			store.load(
				[
					{ id: '1', name: 'Bravo' },
					{ id: '2', name: 'Alpha' }
				],
				'org-1'
			);

			// rawItems same as items when no sort
			expect(store.rawItems).toEqual(store.items);
		});
	});

	describe('concurrent mutation regression', () => {
		it('should preserve update B when concurrent update A fails', async () => {
			let resolveA!: (value: TestItem) => void;
			let rejectA!: (err: Error) => void;
			const promiseA = new Promise<TestItem>((resolve, reject) => {
				resolveA = resolve;
				rejectA = reject;
			});

			let resolveB!: (value: TestItem) => void;
			const promiseB = new Promise<TestItem>((resolve) => {
				resolveB = resolve;
			});

			let callCount = 0;
			const store = makeStore({
				adapterOverrides: {
					update: () => {
						callCount++;
						return callCount === 1 ? promiseA : promiseB;
					}
				}
			});
			store.load(
				[
					{ id: '1', name: 'Alice' },
					{ id: '2', name: 'Bob' }
				],
				'org-1'
			);

			// Both updates start concurrently
			const updateA = store.update('1', { name: 'Alicia' });
			const updateB = store.update('2', { name: 'Bobby' });

			// Both optimistic changes visible
			expect(store.items.find((i) => i.id === '1')?.name).toBe('Alicia');
			expect(store.items.find((i) => i.id === '2')?.name).toBe('Bobby');

			// A fails — B's optimistic state must survive
			rejectA(new Error('network error'));
			await updateA;

			expect(store.items.find((i) => i.id === '1')?.name).toBe('Alice'); // rolled back
			expect(store.items.find((i) => i.id === '2')?.name).toBe('Bobby'); // preserved!

			// B succeeds
			resolveB({ id: '2', name: 'Bobby' });
			await updateB;

			expect(store.items).toEqual([
				{ id: '1', name: 'Alice' },
				{ id: '2', name: 'Bobby' }
			]);
		});

		it('should preserve add B when concurrent add A fails', async () => {
			let rejectA!: (err: Error) => void;
			const promiseA = new Promise<TestItem>((_, reject) => {
				rejectA = reject;
			});

			let resolveB!: (value: TestItem) => void;
			const promiseB = new Promise<TestItem>((resolve) => {
				resolveB = resolve;
			});

			let callCount = 0;
			const store = makeStore({
				adapterOverrides: {
					create: () => {
						callCount++;
						return callCount === 1 ? promiseA : promiseB;
					}
				}
			});
			store.load([], 'org-1');

			const addA = store.add({ name: 'Alpha' });
			const addB = store.add({ name: 'Bravo' });

			// Both optimistic items visible
			expect(store.items.length).toBe(2);
			expect(store.items.some((i) => i.name === 'Alpha')).toBe(true);
			expect(store.items.some((i) => i.name === 'Bravo')).toBe(true);

			// A fails — B's optimistic item must survive
			rejectA(new Error('fail'));
			await addA;

			expect(store.items.length).toBe(1);
			expect(store.items[0].name).toBe('Bravo');

			// B succeeds
			resolveB({ id: 'server-b', name: 'Bravo' });
			await addB;

			expect(store.items).toEqual([{ id: 'server-b', name: 'Bravo' }]);
		});

		it('should accept load during mutation and preserve optimistic state via replay', async () => {
			let resolveUpdate!: (value: TestItem) => void;
			const updatePromise = new Promise<TestItem>((resolve) => {
				resolveUpdate = resolve;
			});

			const store = makeStore({
				adapterOverrides: { update: () => updatePromise }
			});
			store.load(
				[
					{ id: '1', name: 'Alice' },
					{ id: '2', name: 'Bob' }
				],
				'org-1'
			);

			const updateP = store.update('1', { name: 'Alicia' });

			// Optimistic update visible
			expect(store.items.find((i) => i.id === '1')?.name).toBe('Alicia');

			// Server load arrives with new item (e.g., another user added item 3)
			store.load(
				[
					{ id: '1', name: 'Alice' },
					{ id: '2', name: 'Bob' },
					{ id: '3', name: 'Charlie' }
				],
				'org-1'
			);

			// Optimistic update survives load, AND new item is visible
			expect(store.items.find((i) => i.id === '1')?.name).toBe('Alicia');
			expect(store.items.find((i) => i.id === '3')?.name).toBe('Charlie');

			resolveUpdate({ id: '1', name: 'Alicia' });
			await updateP;

			expect(store.items).toEqual([
				{ id: '1', name: 'Alicia' },
				{ id: '2', name: 'Bob' },
				{ id: '3', name: 'Charlie' }
			]);
		});
	});

	describe('onError callback', () => {
		it('should call onError when add fails', async () => {
			const onError = vi.fn();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter({
					create: async () => {
						throw new Error('network error');
					}
				}),
				onError
			});
			store.load([], 'org-1');

			await store.add({ name: 'Fail' });

			expect(onError).toHaveBeenCalledWith('add', expect.any(Error));
		});

		it('should call onError when update fails', async () => {
			const onError = vi.fn();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter({
					update: async () => {
						throw new Error('fail');
					}
				}),
				onError
			});
			store.load([{ id: '1', name: 'Alice' }], 'org-1');

			await store.update('1', { name: 'Changed' });

			expect(onError).toHaveBeenCalledWith('update', expect.any(Error));
		});

		it('should call onError when remove fails', async () => {
			const onError = vi.fn();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter({ remove: async () => 'error' }),
				onError
			});
			store.load([{ id: '1', name: 'Alice' }], 'org-1');

			await store.remove('1');

			expect(onError).toHaveBeenCalledWith('remove', undefined);
		});

		it('should not call onError on success', async () => {
			const onError = vi.fn();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter(),
				onError
			});
			store.load([], 'org-1');

			await store.add({ name: 'Good' });

			expect(onError).not.toHaveBeenCalled();
		});
	});
});
