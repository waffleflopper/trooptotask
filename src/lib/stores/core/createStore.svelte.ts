import type { DeleteResult } from '$lib/utils/deletionRequests';
import { createReactiveCollection, createReactiveValue } from './reactiveState.svelte';
import { createDefaultStrategy, createMutationTracker } from './optimistic';
import { createRestAdapter } from './ports';
import type { ApiAdapter } from './ports';
import type { BeforeAddHook, OptimisticStrategy } from './optimistic';

export interface StoreConfig<T extends { id: string }> {
	resource: string;
	beforeAdd?: BeforeAddHook<T>;
	adapter?: ApiAdapter<T>;
	strategy?: OptimisticStrategy<T>;
	sort?: (a: T, b: T) => number;
}

export interface Store<T extends { id: string }> {
	readonly items: T[];
	readonly rawItems: T[];
	readonly orgId: string;
	load(items: T[], orgId: string): void;
	add(data: Omit<T, 'id'>): Promise<T | null>;
	update(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean>;
	remove(id: string): Promise<DeleteResult>;
	removeBool(id: string): Promise<boolean>;
	setItems(items: T[]): void;
	getItems(): T[];
	getOrgId(): string;
	getById(id: string): T | undefined;
	filter(predicate: (item: T) => boolean): T[];
	find(predicate: (item: T) => boolean): T | undefined;
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
		}
	};
}
