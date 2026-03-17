import type { DeleteResult } from '$lib/utils/deletionRequests';

export interface CrudStoreConfig<T extends { id: string }> {
	resource: string;
	beforeAdd?: (items: T[], data: Omit<T, 'id'>) => { items: T[]; displaced?: T };
}

export interface CrudStore<T extends { id: string }> {
	readonly items: T[];
	load(items: T[], orgId: string): void;
	add(data: Omit<T, 'id'>): Promise<T | null>;
	update(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean>;
	remove(id: string): Promise<DeleteResult>;
	removeBool(id: string): Promise<boolean>;
	setItems(items: T[]): void;
	getItems(): T[];
}

export function createCrudStore<T extends { id: string }>(
	config: CrudStoreConfig<T>
): CrudStore<T> {
	let items = $state.raw<T[]>([]);
	let orgId = '';

	return {
		get items() {
			return items;
		},

		load(newItems: T[], newOrgId: string) {
			items = newItems;
			orgId = newOrgId;
		},

		async add(data: Omit<T, 'id'>): Promise<T | null> {
			const tempId = `temp-${crypto.randomUUID()}`;
			const optimistic = { id: tempId, ...data } as T;
			let displaced: T | undefined;

			if (config.beforeAdd) {
				const result = config.beforeAdd(items, data);
				items = result.items;
				displaced = result.displaced;
			}

			items = [...items, optimistic];

			try {
				const res = await fetch(`/org/${orgId}/api/${config.resource}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data)
				});
				if (!res.ok) throw new Error();
				const created: T = await res.json();
				items = items.map((item) => (item.id === tempId ? created : item));
				return created;
			} catch {
				items = items.filter((item) => item.id !== tempId);
				if (displaced) items = [...items, displaced];
				return null;
			}
		},

		async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean> {
			const original = items.find((item) => item.id === id);
			if (!original) return false;

			items = items.map((item) => (item.id === id ? { ...item, ...data } : item));

			try {
				const res = await fetch(`/org/${orgId}/api/${config.resource}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, ...data })
				});
				if (!res.ok) throw new Error();
				const updated: T = await res.json();
				items = items.map((item) => (item.id === id ? updated : item));
				return true;
			} catch {
				items = items.map((item) => (item.id === id ? original : item));
				return false;
			}
		},

		async remove(id: string): Promise<DeleteResult> {
			const original = items.find((item) => item.id === id);
			if (!original) return 'error';

			items = items.filter((item) => item.id !== id);

			try {
				const res = await fetch(`/org/${orgId}/api/${config.resource}`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id })
				});

				if (res.status === 202) {
					const body = await res.json();
					if (body.requiresApproval) {
						items = [...items, original];
						return 'approval_required';
					}
				}

				if (!res.ok) throw new Error();
				return 'deleted';
			} catch {
				items = [...items, original];
				return 'error';
			}
		},

		async removeBool(id: string): Promise<boolean> {
			const result = await this.remove(id);
			return result === 'deleted';
		},

		setItems(newItems: T[]) {
			items = newItems;
		},

		getItems() {
			return items;
		}
	};
}
