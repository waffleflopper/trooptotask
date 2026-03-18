import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCrudStore } from './crudStore.svelte';

interface TestItem {
	id: string;
	name: string;
}

describe('createCrudStore', () => {
	function makeStore(config?: { beforeAdd?: Parameters<typeof createCrudStore<TestItem>>[0]['beforeAdd'] }) {
		return createCrudStore<TestItem>({
			resource: 'test-items',
			...config
		});
	}

	function mockFetch(response: unknown, status = 200) {
		return vi.fn().mockResolvedValue({
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve(response)
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
			const store = makeStore();
			store.load([], 'org-1');

			const serverItem: TestItem = { id: 'server-1', name: 'Alpha' };
			vi.stubGlobal('fetch', mockFetch(serverItem));

			const result = await store.add({ name: 'Alpha' });

			expect(result).toEqual(serverItem);
			expect(store.items).toEqual([serverItem]);
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/test-items', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alpha' })
			});
		});
		it('should rollback on fetch error', async () => {
			const store = makeStore();
			const existing: TestItem = { id: '1', name: 'Existing' };
			store.load([existing], 'org-1');

			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

			const result = await store.add({ name: 'New' });

			expect(result).toBeNull();
			expect(store.items).toEqual([existing]);
		});
	});

	describe('update', () => {
		it('should update item optimistically then replace with server response', async () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'Old' }], 'org-1');

			const serverItem: TestItem = { id: '1', name: 'Updated' };
			vi.stubGlobal('fetch', mockFetch(serverItem));

			const result = await store.update('1', { name: 'Updated' });

			expect(result).toBe(true);
			expect(store.items).toEqual([serverItem]);
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/test-items', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: '1', name: 'Updated' })
			});
		});

		it('should rollback on fetch error', async () => {
			const store = makeStore();
			const original: TestItem = { id: '1', name: 'Original' };
			store.load([original], 'org-1');

			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

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

			vi.stubGlobal('fetch', mockFetch({}));

			const result = await store.remove('1');

			expect(result).toBe('deleted');
			expect(store.items).toEqual([{ id: '2', name: 'Bravo' }]);
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/test-items', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: '1' })
			});
		});

		it('should handle 202 approval_required and restore item', async () => {
			const store = makeStore();
			const item: TestItem = { id: '1', name: 'Alpha' };
			store.load([item], 'org-1');

			vi.stubGlobal('fetch', mockFetch({ requiresApproval: true }, 202));

			const result = await store.remove('1');

			expect(result).toBe('approval_required');
			expect(store.items).toEqual([item]);
		});

		it('should rollback on fetch error and return error', async () => {
			const store = makeStore();
			const item: TestItem = { id: '1', name: 'Alpha' };
			store.load([item], 'org-1');

			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

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

			vi.stubGlobal('fetch', mockFetch({}));

			const result = await store.removeBool('1');

			expect(result).toBe(true);
			expect(store.items).toEqual([]);
		});

		it('should return false on error', async () => {
			const store = makeStore();
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

			const result = await store.removeBool('1');

			expect(result).toBe(false);
			expect(store.items).toEqual([{ id: '1', name: 'Alpha' }]);
		});
	});

	describe('beforeAdd (upsert)', () => {
		it('should use beforeAdd to filter items before insert', async () => {
			const store = makeStore({
				beforeAdd(items, data) {
					const displaced = items.find((i) => i.name === data.name);
					return {
						items: items.filter((i) => i.name !== data.name),
						displaced
					};
				}
			});
			store.load([{ id: '1', name: 'Alpha' }], 'org-1');

			const serverItem: TestItem = { id: '2', name: 'Alpha' };
			vi.stubGlobal('fetch', mockFetch(serverItem));

			const result = await store.add({ name: 'Alpha' });

			expect(result).toEqual(serverItem);
			expect(store.items).toEqual([serverItem]);
		});

		it('should restore displaced item on rollback', async () => {
			const displaced: TestItem = { id: '1', name: 'Alpha' };
			const store = makeStore({
				beforeAdd(items, data) {
					const found = items.find((i) => i.name === data.name);
					return {
						items: items.filter((i) => i.name !== data.name),
						displaced: found
					};
				}
			});
			store.load([displaced], 'org-1');

			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

			const result = await store.add({ name: 'Alpha' });

			expect(result).toBeNull();
			expect(store.items).toEqual([displaced]);
		});
	});

	describe('setItems / getItems', () => {
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
	});
});
