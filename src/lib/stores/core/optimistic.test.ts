import { describe, it, expect } from 'vitest';
import { createDefaultStrategy, createMutationTracker } from './optimistic';

interface TestItem {
	id: string;
	name: string;
}

describe('OptimisticStrategy', () => {
	const strategy = createDefaultStrategy<TestItem>();

	describe('applyAdd', () => {
		it('should add item with temp ID and provide rollback', () => {
			const items: TestItem[] = [{ id: '1', name: 'Existing' }];
			const { newItems, tempId, rollback } = strategy.applyAdd(items, { name: 'New' });

			expect(newItems).toHaveLength(2);
			expect(tempId).toMatch(/^temp-/);
			expect(newItems[1]).toEqual({ id: tempId, name: 'New' });

			const restored = rollback(newItems);
			expect(restored).toEqual(items);
		});

		it('should use beforeAdd hook and restore displaced on rollback', () => {
			const items: TestItem[] = [{ id: '1', name: 'Alpha' }];
			const beforeAdd = (current: TestItem[], data: Omit<TestItem, 'id'>) => {
				const displaced = current.find((i) => i.name === data.name);
				return { items: current.filter((i) => i.name !== data.name), displaced };
			};

			const { newItems, tempId, rollback } = strategy.applyAdd(items, { name: 'Alpha' }, beforeAdd);

			// Old item displaced, new optimistic item added
			expect(newItems).toHaveLength(1);
			expect(newItems[0].id).toBe(tempId);

			// Rollback restores displaced item
			const restored = rollback(newItems);
			expect(restored).toEqual([{ id: '1', name: 'Alpha' }]);
		});
	});

	describe('applyUpdate', () => {
		it('should merge partial data and provide rollback', () => {
			const items: TestItem[] = [{ id: '1', name: 'Original' }];
			const { newItems, rollback } = strategy.applyUpdate(items, '1', { name: 'Updated' });

			expect(newItems).toEqual([{ id: '1', name: 'Updated' }]);

			const restored = rollback(newItems);
			expect(restored).toEqual([{ id: '1', name: 'Original' }]);
		});
	});

	describe('applyRemove', () => {
		it('should filter item out and provide rollback', () => {
			const items: TestItem[] = [
				{ id: '1', name: 'Alpha' },
				{ id: '2', name: 'Bravo' }
			];
			const { newItems, rollback } = strategy.applyRemove(items, '1');

			expect(newItems).toEqual([{ id: '2', name: 'Bravo' }]);

			const restored = rollback(newItems);
			expect(restored).toContainEqual({ id: '1', name: 'Alpha' });
			expect(restored).toContainEqual({ id: '2', name: 'Bravo' });
		});
	});

	describe('reconcile', () => {
		it('should replace temp item with server item', () => {
			const items: TestItem[] = [
				{ id: '1', name: 'Existing' },
				{ id: 'temp-abc', name: 'New' }
			];
			const serverItem: TestItem = { id: 'server-1', name: 'New' };

			const result = strategy.reconcile(items, 'temp-abc', serverItem);

			expect(result).toEqual([
				{ id: '1', name: 'Existing' },
				{ id: 'server-1', name: 'New' }
			]);
		});
	});
});

describe('MutationTracker', () => {
	it('should start with 0 pending', () => {
		const tracker = createMutationTracker();
		expect(tracker.pending).toBe(0);
	});

	it('should increment pending during wrap and decrement after', async () => {
		const tracker = createMutationTracker();
		let pendingDuringFn = -1;

		await tracker.wrap(async () => {
			pendingDuringFn = tracker.pending;
			return 'result';
		});

		expect(pendingDuringFn).toBe(1);
		expect(tracker.pending).toBe(0);
	});

	it('should decrement pending even on error', async () => {
		const tracker = createMutationTracker();

		await expect(
			tracker.wrap(async () => {
				throw new Error('fail');
			})
		).rejects.toThrow('fail');

		expect(tracker.pending).toBe(0);
	});

	it('should track multiple concurrent wraps', async () => {
		const tracker = createMutationTracker();
		let maxPending = 0;

		const p1 = tracker.wrap(async () => {
			maxPending = Math.max(maxPending, tracker.pending);
			await new Promise((r) => setTimeout(r, 10));
		});
		const p2 = tracker.wrap(async () => {
			maxPending = Math.max(maxPending, tracker.pending);
			await new Promise((r) => setTimeout(r, 10));
		});

		await Promise.all([p1, p2]);

		expect(maxPending).toBe(2);
		expect(tracker.pending).toBe(0);
	});
});
