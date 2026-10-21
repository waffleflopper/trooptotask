import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore } from './createStore.svelte';
import type { Store } from './createStore.svelte';
import { createMockAdapter } from './ports';
import type { ApiAdapter, BatchApiAdapter } from './ports';
import type { BeforeAddHook } from './optimistic';
import { settles } from '$lib/test-support/settles';
import { endOrganizationLifetime } from './lifetime';

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

		it('reuses displayed items until the loaded items or pending mutations change', async () => {
			let resolveRemove!: (value: 'deleted') => void;
			const store = makeStore({
				adapterOverrides: { remove: () => new Promise((resolve) => (resolveRemove = resolve)) }
			});
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' }
				],
				'org-1'
			);

			const removal = store.remove('1');
			const pending = store.rawItems;
			expect(pending).toEqual([{ id: '2', name: 'Bravo' }]);
			expect(store.rawItems).toBe(pending);

			resolveRemove('deleted');
			await removal;
			expect(store.rawItems).not.toBe(pending);
			expect(store.rawItems).toEqual([{ id: '2', name: 'Bravo' }]);

			store.load([{ id: '3', name: 'Charlie' }], 'org-1');
			expect(store.rawItems).toEqual([{ id: '3', name: 'Charlie' }]);
		});
	});

	describe('loading', () => {
		it('should be true before load is called', () => {
			const store = makeStore();
			expect(store.loading).toBe(true);
		});

		it('should be false after load is called', () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'A' }], 'org-1');
			expect(store.loading).toBe(false);
		});

		it('should be true after startLoading is called', () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'A' }], 'org-1');
			expect(store.loading).toBe(false);
			store.startLoading();
			expect(store.loading).toBe(true);
		});

		it('should reset to false on subsequent load after startLoading', () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'A' }], 'org-1');
			store.startLoading();
			store.load([{ id: '2', name: 'B' }], 'org-1');
			expect(store.loading).toBe(false);
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

			await expect(store.add({ name: 'New' })).rejects.toThrow('Network error');
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

	describe('updateOrThrow', () => {
		it('replaces the item with the server response and resolves true', async () => {
			const store = makeStore({ adapterOverrides: { update: async () => ({ id: '1', name: 'Saved' }) } });
			store.load([{ id: '1', name: 'Old' }], 'org-1');

			expect(await store.updateOrThrow('1', { name: 'Saved' })).toBe(true);
			expect(store.items).toEqual([{ id: '1', name: 'Saved' }]);
		});

		it('rejects with the adapter error, restores the item and leaves error reporting to the caller', async () => {
			const original: TestItem = { id: '1', name: 'Original' };
			const onError = vi.fn();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter({
					update: async () => {
						throw new Error('We could not confirm that this was saved.');
					}
				}),
				onError
			});
			store.load([original], 'org-1');

			await expect(store.updateOrThrow('1', { name: 'Changed' })).rejects.toThrow(
				'We could not confirm that this was saved.'
			);
			expect(store.items).toEqual([original]);
			expect(store.busy).toBe(false);
			expect(onError).not.toHaveBeenCalled();
		});

		it('resolves false for an item that is not displayed', async () => {
			const store = makeStore();
			store.load([], 'org-1');

			expect(await store.updateOrThrow('nonexistent', { name: 'Nope' })).toBe(false);
		});

		it('keeps update resolving false and reporting once for the same failure', async () => {
			const onError = vi.fn();
			const failure = new Error('fail');
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter({ update: async () => Promise.reject(failure) }),
				onError
			});
			store.load([{ id: '1', name: 'Original' }], 'org-1');

			expect(await store.update('1', { name: 'Changed' })).toBe(false);
			expect(onError).toHaveBeenCalledExactlyOnceWith('update', failure);
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

			await expect(store.add({ name: 'Alpha' })).rejects.toThrow('fail');
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

			expect(store.items.length).toBe(2);
			expect(store.items.some((i) => i.name === 'New')).toBe(true);

			store.load([{ id: '1', name: 'Existing' }], 'org-1');
			expect(store.items.some((i) => i.name === 'New')).toBe(true);

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

			const pendingAdd = store.add({ name: 'New' });

			store.load([{ id: '10', name: 'Other Org Item' }], 'org-2');

			expect(store.items).toEqual([{ id: '10', name: 'Other Org Item' }]);

			resolveCreate({ id: 'server-1', name: 'New' });
			expect(await settles(pendingAdd)).toBe(false);
			expect(store.items).toEqual([{ id: '10', name: 'Other Org Item' }]);
		});

		it('keeps a new organization row when the old organization remove finishes later', async () => {
			let resolveRemove!: (result: 'deleted') => void;
			const store = makeStore({
				adapterOverrides: {
					remove: () =>
						new Promise((resolve) => {
							resolveRemove = resolve;
						})
				}
			});
			store.load([{ id: 'shared-id', name: 'Old Org Group' }], 'org-1');
			const pendingRemove = store.remove('shared-id');
			store.load([{ id: 'shared-id', name: 'New Org Group' }], 'org-2');

			resolveRemove('deleted');
			expect(await settles(pendingRemove)).toBe(false);
			expect(store.items).toEqual([{ id: 'shared-id', name: 'New Org Group' }]);
		});

		it('ignores an old organization remove rejection after switching organizations', async () => {
			let rejectRemove!: (error: Error) => void;
			const store = makeStore({
				adapterOverrides: {
					remove: () =>
						new Promise((_resolve, reject) => {
							rejectRemove = reject;
						})
				}
			});
			store.load([{ id: 'shared-id', name: 'Old Org Group' }], 'org-1');
			const pendingRemove = store.remove('shared-id');
			store.load([{ id: 'shared-id', name: 'New Org Group' }], 'org-2');

			rejectRemove(new Error('Old request failed'));
			expect(await settles(pendingRemove)).toBe(false);
			expect(store.items).toEqual([{ id: 'shared-id', name: 'New Org Group' }]);
		});

		const lateOperations = {
			add: { start: (store: Store<TestItem>) => store.add({ name: 'New' }), adapter: 'create' },
			addBatch: { start: (store: Store<TestItem>) => store.addBatch([{ name: 'New' }]), adapter: 'create' },
			update: { start: (store: Store<TestItem>) => store.update('shared-id', { name: 'Renamed' }), adapter: 'update' },
			updateOrThrow: {
				start: (store: Store<TestItem>) => store.updateOrThrow('shared-id', { name: 'Renamed' }),
				adapter: 'update'
			},
			remove: { start: (store: Store<TestItem>) => store.remove('shared-id'), adapter: 'remove' },
			removeBatch: { start: (store: Store<TestItem>) => store.removeBatch(['shared-id']), adapter: 'remove' }
		} as const;

		for (const [name, operation] of Object.entries(lateOperations)) {
			for (const outcome of ['resolve', 'reject'] as const) {
				it(`never settles or reports a ${name} that ${outcome}s after switching Organizations`, async () => {
					let settle!: { resolve: (value: unknown) => void; reject: (error: Error) => void };
					const onError = vi.fn();
					const store = createStore<TestItem>({
						resource: 'test-items',
						adapter: makeAdapter({
							[operation.adapter]: () => new Promise((resolve, reject) => (settle = { resolve, reject }))
						}),
						onError
					});
					store.load([{ id: 'shared-id', name: 'Old Org Group' }], 'org-1');
					const pending = operation.start(store);
					store.load([{ id: 'shared-id', name: 'New Org Group' }], 'org-2');

					if (outcome === 'resolve')
						settle.resolve(operation.adapter === 'remove' ? 'deleted' : { id: 'saved', name: 'New' });
					else settle.reject(new Error('Old request failed'));

					expect(await settles(pending)).toBe(false);
					expect(store.items).toEqual([{ id: 'shared-id', name: 'New Org Group' }]);
					expect(store.busy).toBe(false);
					expect(onError).not.toHaveBeenCalled();
				});
			}
		}

		it('never settles, reports or displays a mutation that finishes after the Organization shell ends', async () => {
			let settle!: (item: TestItem) => void;
			const onError = vi.fn();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter({ create: () => new Promise((resolve) => (settle = resolve)) }),
				onError
			});
			store.load([{ id: 'existing', name: 'Existing' }], 'org-1');
			const pending = store.add({ name: 'New' });

			endOrganizationLifetime();
			settle({ id: 'saved', name: 'New' });

			expect(await settles(pending)).toBe(false);
			expect(onError).not.toHaveBeenCalled();

			store.load([{ id: 'existing', name: 'Existing' }], 'org-1');
			expect(store.items).toEqual([{ id: 'existing', name: 'Existing' }]);
			expect(store.busy).toBe(false);
		});

		it('rolls back a rejected remove in the current organization', async () => {
			const store = makeStore({
				adapterOverrides: { remove: async () => Promise.reject(new Error('Current request failed')) }
			});
			store.load([{ id: 'group-a', name: 'Alpha' }], 'org-1');

			await expect(store.remove('group-a')).rejects.toThrow('Current request failed');
			expect(store.items).toEqual([{ id: 'group-a', name: 'Alpha' }]);
			expect(store.busy).toBe(false);
		});

		it('keeps a new organization row when the old organization rename finishes later', async () => {
			let resolveUpdate!: (item: TestItem) => void;
			const store = makeStore({
				adapterOverrides: {
					update: () =>
						new Promise((resolve) => {
							resolveUpdate = resolve;
						})
				}
			});
			store.load([{ id: 'shared-id', name: 'Old Org Group' }], 'org-1');
			const pendingRename = store.update('shared-id', { name: 'Renamed' });
			store.load([{ id: 'shared-id', name: 'New Org Group' }], 'org-2');

			resolveUpdate({ id: 'shared-id', name: 'Renamed' });
			expect(await settles(pendingRename)).toBe(false);
			expect(store.items).toEqual([{ id: 'shared-id', name: 'New Org Group' }]);
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

		it('rolls back every temp item and rejects with the batch failure', async () => {
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

			await expect(store.addBatch([{ name: 'New1' }, { name: 'New2' }])).rejects.toThrow('batch fail');
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
				removeBatch: async (ids) => ({ deleted: ids.length, completedIds: ids }),
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

			expect(result).toEqual({ kind: 'removed', deleted: 2 });
			expect(store.items).toEqual([{ id: '2', name: 'Bravo' }]);
		});

		it('reports the adapter count when fewer rows were deleted than requested', async () => {
			const batchAdapter = makeBatchAdapter({ removeBatch: async (ids) => ({ deleted: 1, completedIds: ids }) });
			const store = createStore<TestItem>({ resource: 'test-items', adapter: batchAdapter, batchAdapter });
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' },
					{ id: '3', name: 'Charlie' }
				],
				'org-1'
			);

			const result = await store.removeBatch(['1', '2', '3']);

			expect(result).toEqual({ kind: 'removed', deleted: 1 });
			expect(store.items).toEqual([]);
		});

		it('removes only the completed IDs locally and reports a partial result', async () => {
			const batchAdapter = makeBatchAdapter({
				removeBatch: async () => ({ deleted: 2, completedIds: ['1', '2'] })
			});
			const store = createStore<TestItem>({ resource: 'test-items', adapter: batchAdapter, batchAdapter });
			store.load(
				[
					{ id: '1', name: 'Alpha' },
					{ id: '2', name: 'Bravo' },
					{ id: '3', name: 'Charlie' }
				],
				'org-1'
			);

			const result = await store.removeBatch(['1', '2', '3']);

			expect(result).toEqual({ kind: 'partial', deleted: 2, completedIds: ['1', '2'] });
			expect(store.items).toEqual([{ id: '3', name: 'Charlie' }]);
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

			expect(result).toEqual({ kind: 'failed' });
			expect(store.items).toHaveLength(2);
			expect(store.items.find((i) => i.id === '1')).toEqual({ id: '1', name: 'Alpha' });
			expect(store.items.find((i) => i.id === '2')).toEqual({ id: '2', name: 'Bravo' });
		});

		it('falls back to per-item removes and keeps the items whose request failed', async () => {
			const items: TestItem[] = [
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			];
			const store = makeStore({
				adapterOverrides: { remove: async (id) => (id === '3' ? 'error' : 'deleted') }
			});
			store.load(items, 'org-1');

			const result = await store.removeBatch(['1', '3']);

			expect(result).toEqual({ kind: 'partial', deleted: 1, completedIds: ['1'] });
			expect(store.items).toEqual([
				{ id: '2', name: 'Bravo' },
				{ id: '3', name: 'Charlie' }
			]);
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

			expect(store.items[0].name).toBe('Bravo');

			await store.update('1', { sortOrder: 0 });

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

			expect(store.rawItems).toEqual(store.items);
		});
	});

	describe('concurrent mutation regression', () => {
		it('should preserve update B when concurrent update A fails', async () => {
			let rejectA!: (err: Error) => void;
			const promiseA = new Promise<TestItem>((_resolve, reject) => {
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

			const updateA = store.update('1', { name: 'Alicia' });
			const updateB = store.update('2', { name: 'Bobby' });

			expect(store.items.find((i) => i.id === '1')?.name).toBe('Alicia');
			expect(store.items.find((i) => i.id === '2')?.name).toBe('Bobby');

			rejectA(new Error('network error'));
			await updateA;

			expect(store.items.find((i) => i.id === '1')?.name).toBe('Alice');
			expect(store.items.find((i) => i.id === '2')?.name).toBe('Bobby');

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

			expect(store.items.length).toBe(2);
			expect(store.items.some((i) => i.name === 'Alpha')).toBe(true);
			expect(store.items.some((i) => i.name === 'Bravo')).toBe(true);

			rejectA(new Error('fail'));
			await expect(addA).rejects.toThrow('fail');

			expect(store.items.length).toBe(1);
			expect(store.items[0].name).toBe('Bravo');

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

			expect(store.items.find((i) => i.id === '1')?.name).toBe('Alicia');

			store.load(
				[
					{ id: '1', name: 'Alice' },
					{ id: '2', name: 'Bob' },
					{ id: '3', name: 'Charlie' }
				],
				'org-1'
			);

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

			await expect(store.add({ name: 'Fail' })).rejects.toThrow('network error');

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

		it('should not call onError for approval_required', async () => {
			const onError = vi.fn();
			const store = createStore<TestItem>({
				resource: 'test-items',
				adapter: makeAdapter({ remove: async () => 'approval_required' }),
				onError
			});
			store.load([{ id: '1', name: 'Alice' }], 'org-1');

			await store.remove('1');

			expect(onError).not.toHaveBeenCalled();
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

	describe('beginRead', () => {
		const all = () => true;

		it('keeps changes an older open read still needs after a newer read closes', async () => {
			const store = makeStore();
			store.load([{ id: 'a', name: 'A' }], 'org-1');
			const older = store.beginRead();
			await store.add({ name: 'Saved' });
			const newer = store.beginRead();
			newer.close();

			expect(older.reconcile([{ id: 'a', name: 'A' }], all)).toEqual([
				{ id: 'a', name: 'A' },
				{ id: 'server-1', name: 'Saved' }
			]);
		});

		it('keeps a delete whose confirmation arrives after a newer read already removed the row', async () => {
			let acknowledge!: () => void;
			const store = makeStore({
				adapterOverrides: { remove: () => new Promise((resolve) => (acknowledge = () => resolve('deleted'))) }
			});
			store.load([{ id: 'a', name: 'A' }], 'org-1');
			const older = store.beginRead();
			const deleting = store.remove('a');
			const newer = store.beginRead();
			store.load(newer.reconcile([], all), 'org-1');
			newer.close();
			acknowledge();
			await deleting;

			expect(older.reconcile([{ id: 'a', name: 'A' }], all)).toEqual([]);
		});

		it.each(['update', 'updateOrThrow'] as const)(
			'restores a confirmed %s to a row a newer read had removed',
			async (method) => {
				let acknowledge!: () => void;
				const store = makeStore({
					adapterOverrides: {
						update: (id, data) =>
							new Promise((resolve) => (acknowledge = () => resolve({ id, name: 'Edited', ...data } as TestItem)))
					}
				});
				store.load([{ id: 'a', name: 'A' }], 'org-1');
				const older = store.beginRead();
				const updating = store[method]('a', { name: 'Edited' });
				store.load([], 'org-1');
				acknowledge();
				await updating;

				expect(older.reconcile([{ id: 'a', name: 'A' }], all)).toEqual([{ id: 'a', name: 'Edited' }]);
			}
		);

		it('re-applies nothing once the read is closed', async () => {
			const store = makeStore();
			store.load([{ id: 'a', name: 'A' }], 'org-1');
			const read = store.beginRead();
			await store.remove('a');
			read.close();

			expect(read.reconcile([{ id: 'a', name: 'A' }], all)).toEqual([{ id: 'a', name: 'A' }]);
		});

		it('forgets changes from an Organization the store has left', async () => {
			const store = makeStore();
			store.load([{ id: 'a', name: 'A' }], 'org-1');
			const read = store.beginRead();
			await store.remove('a');
			store.load([], 'org-2');

			expect(read.reconcile([{ id: 'b', name: 'B' }], all)).toEqual([{ id: 'b', name: 'B' }]);
		});
	});
});
