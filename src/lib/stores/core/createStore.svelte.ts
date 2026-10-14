import type { DeleteResult } from './ports';
import { createReactiveCollection, createReactiveValue } from './reactiveState.svelte';
import { createMutationLog } from './mutationLog.svelte';
import type { MutationLog } from './mutationLog.svelte';
import { replay } from './replay';
import type { MutationEntry } from './replay';
import { createRestAdapter } from './ports';
import type { ApiAdapter, BatchApiAdapter } from './ports';
import type { BeforeAddHook } from './optimistic';
import { organizationLifetime, withinOrganizationLifetime } from './lifetime';

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
	readonly loadVersion: number;
	readonly busy: boolean;
	readonly loading: boolean;
	load(items: T[], orgId: string): void;
	startLoading(): void;
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

export interface StoreInternals<T extends { id: string }> {
	serverState: ReturnType<typeof createReactiveCollection<T>>;
	log: MutationLog<T>;
	replay(): T[];
	snapshot(): T[];
	orgId(): string;
	withinOrganization<R>(work: Promise<R>): Promise<R>;
	adapter: ApiAdapter<T>;
}

export function createStoreWithInternals<T extends { id: string }>(
	config: StoreConfig<T>
): { store: Store<T>; internals: StoreInternals<T> } {
	const serverState = createReactiveCollection<T>();
	const orgIdVal = createReactiveValue('');
	const loadingVal = createReactiveValue(true);
	const log = createMutationLog<T>();
	let organizationVersion = 0;
	let loadedLifetime = organizationLifetime();
	let loadVersion = 0;

	// A response also goes stale when the store loads another Organization without a shell remount.
	function withinOrganization<R>(work: Promise<R>): Promise<R> {
		const version = organizationVersion;
		return withinOrganizationLifetime(work, () => version === organizationVersion);
	}

	let adapter: ApiAdapter<T> = config.adapter ?? createRestAdapter<T>(() => orgIdVal.value, config.resource);

	let display: { server: T[]; entries: MutationEntry<T>[]; items: T[] } | null = null;

	function getDisplayItems(): T[] {
		const server = serverState.items;
		const entries = log.entries;
		if (display?.server !== server || display.entries !== entries) {
			display = { server, entries, items: replay(server, entries, config.beforeAdd) };
		}
		return display.items;
	}

	async function removeImpl(id: string): Promise<DeleteResult> {
		const displayed = getDisplayItems();
		const original = displayed.find((item) => item.id === id);
		if (!original) return 'error';

		const mutationId = crypto.randomUUID();
		log.push({ type: 'remove', mutationId, targetId: id });

		let result: DeleteResult;
		try {
			result = await withinOrganization(adapter.remove(id));
		} catch (error) {
			log.resolve(mutationId);
			throw error;
		}
		if (result === 'deleted') {
			serverState.set(serverState.getSnapshot().filter((item) => item.id !== id));
		} else if (result === 'error') {
			config.onError?.('remove', undefined);
		}
		log.resolve(mutationId);
		return result;
	}

	const store: Store<T> = {
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

		get loadVersion() {
			return loadVersion;
		},

		get busy() {
			return log.pending > 0;
		},

		get loading() {
			return loadingVal.value;
		},

		startLoading() {
			loadingVal.set(true);
		},

		load(newItems: T[], newOrgId: string) {
			loadVersion++;
			if (newOrgId !== orgIdVal.value || loadedLifetime !== organizationLifetime()) {
				organizationVersion++;
				log.clear();
			}
			loadedLifetime = organizationLifetime();
			serverState.set(newItems);
			orgIdVal.set(newOrgId);
			loadingVal.set(false);
			if (!config.adapter) {
				adapter = createRestAdapter<T>(() => orgIdVal.value, config.resource);
			}
		},

		async add(data: Omit<T, 'id'>): Promise<T | null> {
			const tempId = `temp-${crypto.randomUUID()}`;
			const mutationId = crypto.randomUUID();
			log.push({ type: 'add', mutationId, tempId, data });

			try {
				const created = await withinOrganization(adapter.create(data));
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
				throw e;
			}
		},

		async addBatch(entries: Omit<T, 'id'>[]): Promise<T[]> {
			const mutationId = crypto.randomUUID();
			const tempIds = entries.map(() => `temp-${crypto.randomUUID()}`);
			log.push({ type: 'add-batch', mutationId, tempIds, data: entries });

			try {
				const created = await withinOrganization(
					config.batchAdapter
						? config.batchAdapter.createBatch(entries)
						: Promise.all(entries.map((data) => adapter.create(data)))
				);
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
			const displayed = getDisplayItems();
			const original = displayed.find((item) => item.id === id);
			if (!original) return false;

			const mutationId = crypto.randomUUID();
			log.push({ type: 'update', mutationId, targetId: id, data: data as Partial<T> });

			try {
				const updated = await withinOrganization(adapter.update(id, data));
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
				await withinOrganization<unknown>(
					config.batchAdapter?.removeBatch
						? config.batchAdapter.removeBatch(ids)
						: Promise.all(ids.map((id) => adapter.remove(id)))
				);
				const idsToRemove: Record<string, true> = Object.create(null);
				for (const id of ids) {
					idsToRemove[id] = true;
				}
				serverState.set(serverState.getSnapshot().filter((item) => !Object.hasOwn(idsToRemove, item.id)));
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
				const updatedById: Record<string, T> = Object.create(null);
				for (const item of updated) {
					updatedById[item.id] = item;
				}
				current = current.map((item) => updatedById[item.id] ?? item);
			}
			serverState.set([...current, ...inserted]);
		},

		getById(id: string) {
			return getDisplayItems().find((item) => item.id === id);
		},

		filter(predicate: (item: T) => boolean) {
			return getDisplayItems().filter(predicate);
		},

		find(predicate: (item: T) => boolean) {
			return getDisplayItems().find(predicate);
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

	const internals: StoreInternals<T> = {
		serverState,
		log,
		replay: () => getDisplayItems(),
		snapshot: () => getDisplayItems(),
		orgId: () => orgIdVal.value,
		withinOrganization,
		get adapter() {
			return adapter;
		}
	};

	return { store, internals };
}

export function createStore<T extends { id: string }>(config: StoreConfig<T>): Store<T> {
	return createStoreWithInternals(config).store;
}
