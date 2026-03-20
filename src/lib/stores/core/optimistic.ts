export type BeforeAddHook<T> = (items: T[], data: Omit<T, 'id'>) => { items: T[]; displaced?: T };

export interface OptimisticStrategy<T extends { id: string }> {
	applyAdd(
		items: T[],
		data: Omit<T, 'id'>,
		beforeAdd?: BeforeAddHook<T>
	): { newItems: T[]; tempId: string; rollback: (items: T[]) => T[] };

	applyUpdate(items: T[], id: string, data: Partial<T>): { newItems: T[]; rollback: (items: T[]) => T[] };

	applyRemove(items: T[], id: string): { newItems: T[]; rollback: (items: T[]) => T[] };

	reconcile(items: T[], tempId: string, serverItem: T): T[];
}

export function createDefaultStrategy<T extends { id: string }>(): OptimisticStrategy<T> {
	return {
		applyAdd(items, data, beforeAdd?) {
			const tempId = `temp-${crypto.randomUUID()}`;
			const optimistic = { id: tempId, ...data } as T;
			let displaced: T | undefined;
			let baseItems = items;

			if (beforeAdd) {
				const result = beforeAdd(items, data);
				baseItems = result.items;
				displaced = result.displaced;
			}

			const newItems = [...baseItems, optimistic];

			return {
				newItems,
				tempId,
				rollback: (current: T[]) => {
					const filtered = current.filter((item) => item.id !== tempId);
					if (displaced) return [...filtered, displaced];
					return filtered;
				}
			};
		},

		applyUpdate(items, id, data) {
			const original = items.find((item) => item.id === id);
			const newItems = items.map((item) => (item.id === id ? { ...item, ...data } : item));

			return {
				newItems,
				rollback: (current: T[]) => (original ? current.map((item) => (item.id === id ? original : item)) : current)
			};
		},

		applyRemove(items, id) {
			const original = items.find((item) => item.id === id);
			const newItems = items.filter((item) => item.id !== id);

			return {
				newItems,
				rollback: (current: T[]) => (original ? [...current, original] : current)
			};
		},

		reconcile(items, tempId, serverItem) {
			return items.map((item) => (item.id === tempId ? serverItem : item));
		}
	};
}

export interface MutationTracker {
	readonly pending: number;
	wrap<R>(fn: () => Promise<R>): Promise<R>;
}

export function createMutationTracker(): MutationTracker {
	let pending = 0;

	return {
		get pending() {
			return pending;
		},
		async wrap<R>(fn: () => Promise<R>): Promise<R> {
			pending++;
			try {
				return await fn();
			} finally {
				pending--;
			}
		}
	};
}
