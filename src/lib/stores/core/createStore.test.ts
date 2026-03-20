import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore } from './createStore.svelte';
import { createMockAdapter } from './ports';
import type { ApiAdapter } from './ports';
import type { BeforeAddHook } from './optimistic';

interface TestItem {
	id: string;
	name: string;
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

	describe('setItems / getItems / getById / filter / find', () => {
		it('should allow direct item manipulation via escape hatches', () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			expect(store.getItems()).toEqual([{ id: '1', name: 'Alpha' }]);

			store.setItems([
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			]);

			expect(store.items).toEqual([
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			]);
			expect(store.getItems()).toEqual(store.items);
		});

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
});
