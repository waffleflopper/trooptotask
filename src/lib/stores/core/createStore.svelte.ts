import type { DeleteResult } from '$lib/utils/deletionRequests';
import { createReactiveCollection, createReactiveValue } from './reactiveState.svelte';
import { createMutationLog } from './mutationLog.svelte';
import { replay } from './replay';
import { createRestAdapter } from './ports';
import type { ApiAdapter, BatchApiAdapter } from './ports';
import type { BeforeAddHook } from './optimistic';

export interface StoreConfig<T extends { id: string }> {
	resource: string;
	beforeAdd?: BeforeAddHook<T>;
	adapter?: ApiAdapter<T>;
	batchAdapter?: BatchApiAdapter<T>;
	sort?: (a: T, b: T) => number;
	onError?: (operation: string, error?: unknown) => void;
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
	getById(id: string): T | undefined;
	filter(predicate: (item: T) => boolean): T[];
	find(predicate: (item: T) => boolean): T | undefined;
	removeLocalWhere(predicate: (item: T) => boolean): void;
	updateLocalWhere(predicate: (item: T) => boolean, updater: (item: T) => T): void;
	appendLocal(items: T[]): void;
}

export function createStore<T extends { id: string }>(config: StoreConfig<T>): Store<T> {
	const serverState = createReactiveCollection<T>();
	const orgIdVal = createReactiveValue('');
	const log = createMutationLog<T>();

	let adapter: ApiAdapter<T> = config.adapter ?? createRestAdapter<T>(() => orgIdVal.value, config.resource);

	function getDisplayItems(): T[] {
		return replay(serverState.items, log.entries, config.beforeAdd);
	}

	function getDisplaySnapshot(): T[] {
		return replay(serverState.getSnapshot(), log.entries, config.beforeAdd);
	}

	async function removeImpl(id: string): Promise<DeleteResult> {
		const displayed = getDisplaySnapshot();
		const original = displayed.find((item) => item.id === id);
		if (!original) return 'error';

		const mutationId = crypto.randomUUID();
		log.push({ type: 'remove', mutationId, targetId: id });

		const result = await adapter.remove(id);
		if (result === 'deleted') {
			serverState.set(serverState.getSnapshot().filter((item) => item.id !== id));
		} else if (result === 'error') {
			config.onError?.('remove', undefined);
		}
		log.resolve(mutationId);
		return result;
	}

	return {
		get items() {
			const raw = getDisplayItems();
			return config.sort ? [...raw].sort(config.sort) : raw;
		},

		get rawItems() {
			return getDisplayItems();
		},

		get orgId() {
			return orgIdVal.value;
		},

		get busy() {
			return log.pending > 0;
		},

		load(newItems: T[], newOrgId: string) {
			if (newOrgId !== orgIdVal.value) {
				log.clear();
			}
			serverState.set(newItems);
			orgIdVal.set(newOrgId);
			if (!config.adapter) {
				adapter = createRestAdapter<T>(() => orgIdVal.value, config.resource);
			}
		},

		async add(data: Omit<T, 'id'>): Promise<T | null> {
			const tempId = `temp-${crypto.randomUUID()}`;
			const mutationId = crypto.randomUUID();
			log.push({ type: 'add', mutationId, tempId, data });

			try {
				const created = await adapter.create(data);
				let current = serverState.getSnapshot();
				if (config.beforeAdd) {
					const { items } = config.beforeAdd(current, data);
					current = items;
				}
				serverState.set([...current, created]);
				log.resolve(mutationId);
				return created;
			} catch (e) {
				config.onError?.('add', e);
				log.resolve(mutationId);
				return null;
			}
		},

		async addBatch(entries: Omit<T, 'id'>[]): Promise<T[]> {
			const mutationId = crypto.randomUUID();
			const tempIds = entries.map(() => `temp-${crypto.randomUUID()}`);
			log.push({ type: 'add-batch', mutationId, tempIds, data: entries });

			try {
				let created: T[];
				if (config.batchAdapter) {
					created = await config.batchAdapter.createBatch(entries);
				} else {
					created = await Promise.all(entries.map((data) => adapter.create(data)));
				}
				serverState.set([...serverState.getSnapshot(), ...created]);
				log.resolve(mutationId);
				return created;
			} catch (e) {
				config.onError?.('addBatch', e);
				log.resolve(mutationId);
				return [];
			}
		},

		async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean> {
			const displayed = getDisplaySnapshot();
			const original = displayed.find((item) => item.id === id);
			if (!original) return false;

			const mutationId = crypto.randomUUID();
			log.push({ type: 'update', mutationId, targetId: id, data: data as Partial<T> });

			try {
				const updated = await adapter.update(id, data);
				serverState.set(serverState.getSnapshot().map((item) => (item.id === id ? updated : item)));
				log.resolve(mutationId);
				return true;
			} catch (e) {
				config.onError?.('update', e);
				log.resolve(mutationId);
				return false;
			}
		},

		remove: removeImpl,

		async removeBool(id: string): Promise<boolean> {
			const result = await removeImpl(id);
			return result === 'deleted';
		},

		async removeBatch(ids: string[]): Promise<boolean> {
			const mutationId = crypto.randomUUID();
			log.push({ type: 'remove-batch', mutationId, targetIds: ids });

			try {
				if (config.batchAdapter?.removeBatch) {
					await config.batchAdapter.removeBatch(ids);
				} else {
					await Promise.all(ids.map((id) => adapter.remove(id)));
				}
				const idSet = new Set(ids);
				serverState.set(serverState.getSnapshot().filter((item) => !idSet.has(item.id)));
				log.resolve(mutationId);
				return true;
			} catch (e) {
				config.onError?.('removeBatch', e);
				log.resolve(mutationId);
				return false;
			}
		},

		mergeBatchResults(inserted: T[], updated?: T[]) {
			let current = serverState.getSnapshot();
			if (updated && updated.length > 0) {
				const updatedMap = new Map(updated.map((u) => [u.id, u]));
				current = current.map((item) => updatedMap.get(item.id) ?? item);
			}
			serverState.set([...current, ...inserted]);
		},

		getById(id: string) {
			return getDisplaySnapshot().find((item) => item.id === id);
		},

		filter(predicate: (item: T) => boolean) {
			return getDisplaySnapshot().filter(predicate);
		},

		find(predicate: (item: T) => boolean) {
			return getDisplaySnapshot().find(predicate);
		},

		removeLocalWhere(predicate: (item: T) => boolean) {
			serverState.set(serverState.getSnapshot().filter((item) => !predicate(item)));
		},

		updateLocalWhere(predicate: (item: T) => boolean, updater: (item: T) => T) {
			serverState.set(serverState.getSnapshot().map((item) => (predicate(item) ? updater(item) : item)));
		},

		appendLocal(items: T[]) {
			serverState.set([...serverState.getSnapshot(), ...items]);
		}
	};
}
