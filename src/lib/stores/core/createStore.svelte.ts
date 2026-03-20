import type { DeleteResult } from '$lib/utils/deletionRequests';
import { createReactiveCollection, createReactiveValue } from './reactiveState.svelte';
import { createDefaultStrategy, createMutationTracker } from './optimistic';
import { createRestAdapter } from './ports';
import type { ApiAdapter, BatchApiAdapter } from './ports';
import type { BeforeAddHook, OptimisticStrategy } from './optimistic';

export interface StoreConfig<T extends { id: string }> {
	resource: string;
	beforeAdd?: BeforeAddHook<T>;
	adapter?: ApiAdapter<T>;
	batchAdapter?: BatchApiAdapter<T>;
	strategy?: OptimisticStrategy<T>;
	sort?: (a: T, b: T) => number;
}

export interface Store<T extends { id: string }> {
	readonly items: T[];
	readonly rawItems: T[];
	readonly orgId: string;
	readonly busy: boolean;
	load(items: T[], orgId: string): void;
	add(data: Omit<T, 'id'>): Promise<T | null>;
	addBatch(entries: Omit<T, 'id'>[]): Promise<T[]>;
	update(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean>;
	remove(id: string): Promise<DeleteResult>;
	removeBool(id: string): Promise<boolean>;
	removeBatch(ids: string[]): Promise<boolean>;
	mergeBatchResults(inserted: T[], updated?: T[]): void;
	setItems(items: T[]): void;
	getItems(): T[];
	getOrgId(): string;
	getById(id: string): T | undefined;
	filter(predicate: (item: T) => boolean): T[];
	find(predicate: (item: T) => boolean): T | undefined;
	removeLocalWhere(predicate: (item: T) => boolean): void;
}

export function createStore<T extends { id: string }>(config: StoreConfig<T>): Store<T> {
	const collection = createReactiveCollection<T>();
	const orgIdVal = createReactiveValue('');
	const tracker = createMutationTracker();
	const strategy = config.strategy ?? createDefaultStrategy<T>();

	let adapter: ApiAdapter<T> = config.adapter ?? createRestAdapter<T>(() => orgIdVal.value, config.resource);

	async function removeImpl(id: string): Promise<DeleteResult> {
		const snapshot = collection.getSnapshot();
		const original = snapshot.find((item) => item.id === id);
		if (!original) return 'error';

		const { newItems, rollback } = strategy.applyRemove(snapshot, id);
		collection.set(newItems);

		return tracker.wrap(async () => {
			const result = await adapter.remove(id);
			if (result === 'approval_required' || result === 'error') {
				collection.set(rollback(collection.getSnapshot()));
			}
			return result;
		});
	}

	return {
		get items() {
			const raw = collection.items;
			return config.sort ? [...raw].sort(config.sort) : raw;
		},

		get rawItems() {
			return collection.items;
		},

		get orgId() {
			return orgIdVal.value;
		},

		get busy() {
			return tracker.pending > 0;
		},

		load(newItems: T[], newOrgId: string) {
			if (tracker.pending > 0 && newOrgId === orgIdVal.value) {
				return;
			}
			collection.set(newItems);
			orgIdVal.set(newOrgId);
			if (!config.adapter) {
				adapter = createRestAdapter<T>(() => orgIdVal.value, config.resource);
			}
		},

		async add(data: Omit<T, 'id'>): Promise<T | null> {
			const snapshot = collection.getSnapshot();
			const { newItems, tempId, rollback } = strategy.applyAdd(snapshot, data, config.beforeAdd);
			collection.set(newItems);

			return tracker.wrap(async () => {
				try {
					const created = await adapter.create(data);
					collection.set(strategy.reconcile(collection.getSnapshot(), tempId, created));
					return created;
				} catch {
					collection.set(rollback(collection.getSnapshot()));
					return null;
				}
			});
		},

		async addBatch(entries: Omit<T, 'id'>[]): Promise<T[]> {
			const snapshot = collection.getSnapshot();
			const tempIds: string[] = [];
			const tempItems = entries.map((data) => {
				const tempId = `temp-${crypto.randomUUID()}`;
				tempIds.push(tempId);
				return { id: tempId, ...data } as T;
			});
			collection.set([...snapshot, ...tempItems]);

			return tracker.wrap(async () => {
				try {
					let created: T[];
					if (config.batchAdapter) {
						created = await config.batchAdapter.createBatch(entries);
					} else {
						created = await Promise.all(entries.map((data) => adapter.create(data)));
					}
					const tempIdSet = new Set(tempIds);
					collection.set([...collection.getSnapshot().filter((item) => !tempIdSet.has(item.id)), ...created]);
					return created;
				} catch {
					const tempIdSet = new Set(tempIds);
					collection.set(collection.getSnapshot().filter((item) => !tempIdSet.has(item.id)));
					return [];
				}
			});
		},

		async removeBatch(ids: string[]): Promise<boolean> {
			const snapshot = collection.getSnapshot();
			const idSet = new Set(ids);
			const removed = snapshot.filter((item) => idSet.has(item.id));
			collection.set(snapshot.filter((item) => !idSet.has(item.id)));

			return tracker.wrap(async () => {
				try {
					if (config.batchAdapter?.removeBatch) {
						await config.batchAdapter.removeBatch(ids);
					} else {
						await Promise.all(ids.map((id) => adapter.remove(id)));
					}
					return true;
				} catch {
					collection.set([...collection.getSnapshot(), ...removed]);
					return false;
				}
			});
		},

		mergeBatchResults(inserted: T[], updated?: T[]) {
			let current = collection.getSnapshot();
			if (updated && updated.length > 0) {
				const updatedMap = new Map(updated.map((u) => [u.id, u]));
				current = current.map((item) => updatedMap.get(item.id) ?? item);
			}
			collection.set([...current, ...inserted]);
		},

		async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean> {
			const snapshot = collection.getSnapshot();
			const original = snapshot.find((item) => item.id === id);
			if (!original) return false;

			const { newItems, rollback } = strategy.applyUpdate(snapshot, id, data as Partial<T>);
			collection.set(newItems);

			return tracker.wrap(async () => {
				try {
					const updated = await adapter.update(id, data);
					collection.set(collection.getSnapshot().map((item) => (item.id === id ? updated : item)));
					return true;
				} catch {
					collection.set(rollback(collection.getSnapshot()));
					return false;
				}
			});
		},

		remove: removeImpl,

		async removeBool(id: string): Promise<boolean> {
			const result = await removeImpl(id);
			return result === 'deleted';
		},

		setItems(newItems: T[]) {
			collection.set(newItems);
		},

		getItems() {
			return collection.getSnapshot();
		},

		getOrgId() {
			return orgIdVal.value;
		},

		getById(id: string) {
			return collection.getSnapshot().find((item) => item.id === id);
		},

		filter(predicate: (item: T) => boolean) {
			return collection.getSnapshot().filter(predicate);
		},

		find(predicate: (item: T) => boolean) {
			return collection.getSnapshot().find(predicate);
		},

		removeLocalWhere(predicate: (item: T) => boolean) {
			collection.set(collection.getSnapshot().filter((item) => !predicate(item)));
		}
	};
}
