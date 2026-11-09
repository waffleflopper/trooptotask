import type { DeleteResult } from './ports';
import { createReactiveCollection, createReactiveValue } from './reactiveState.svelte';
import { createMutationLog } from './mutationLog.svelte';
import type { MutationLog } from './mutationLog.svelte';
import { replay } from './replay';
import type { MutationEntry } from './replay';
import { createRestAdapter } from './ports';
import type { ApiAdapter, BatchApiAdapter } from './ports';
import type { BeforeAddHook } from './optimistic';
import {
	organizationLifetime,
	stillInOrganizationLifetime,
	withinOrganizationLifetime,
	withinOrganizationWrite
} from './lifetime.svelte';
import {
	applyConfirmedChange,
	confirmedSequence,
	nextConfirmedSequence,
	CONFIRMED_CHANGE_RETENTION_MS,
	SnapshotTooOldError,
	type ConfirmedChange,
	type ConfirmedChangeInput
} from './confirmedChanges';

export interface StoreConfig<T extends { id: string }> {
	resource: string;
	beforeAdd?: BeforeAddHook<T>;
	adapter?: ApiAdapter<T>;
	batchAdapter?: BatchApiAdapter<T>;
	sort?: (a: T, b: T) => number;
	onError?: (operation: string, error?: unknown) => void;
}

/**
 * A snapshot read whose request left at a known point in the confirmed history. Reconciling it
 * replaces what the snapshot covers, then re-applies every change the store confirmed after the
 * request left, because the server may have read before them. A snapshot whose request left
 * before an adopted full read changes nothing; one older than the retained changes throws
 * `SnapshotTooOldError`.
 */
export interface StoreRead<T extends { id: string }> {
	reconcile(snapshot: T[], covers: (item: T) => boolean): T[];
	close(): void;
}

/** A read of every row that supersedes snapshots whose requests left before it began. */
export interface StoreAdoption<T extends { id: string }> {
	adopt(snapshot: T[]): T[];
	close(): void;
}

/**
 * `removed` carries the real deleted count, which is zero when the rows were already gone. `partial`
 * stopped before the last ID: `completedIds` left the store and the rest remain. `failed` removed nothing.
 */
export type BatchRemovalOutcome =
	| { kind: 'removed'; deleted: number }
	| { kind: 'partial'; deleted: number; completedIds: string[] }
	| { kind: 'failed' };

export interface Store<T extends { id: string }> {
	readonly items: T[];
	readonly rawItems: T[];
	readonly orgId: string;
	readonly loadVersion: number;
	/** Writes the server confirmed. Loads and reads leave it unchanged, so a reader can refetch what a write moved. */
	readonly writes: number;
	readonly busy: boolean;
	readonly loading: boolean;
	load(items: T[], orgId: string): void;
	/** `since` is the sequence the request carried; it defaults to now for a request about to leave. */
	beginRead(since?: number): StoreRead<T>;
	/** Begin just before requesting every row. */
	beginAdoption(): StoreAdoption<T>;
	startLoading(): void;
	add(data: Omit<T, 'id'>): Promise<T | null>;
	/** Resolves to the saved entries (a partial batch may save fewer); rejects with the error when none saved. */
	addBatch(entries: Omit<T, 'id'>[]): Promise<T[]>;
	update(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean>;
	/** Like `update`, but a failed write rejects with its error and skips `onError`, so the caller can show the reason. */
	updateOrThrow(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean>;
	remove(id: string): Promise<DeleteResult>;
	removeBool(id: string): Promise<boolean>;
	removeBatch(ids: string[]): Promise<BatchRemovalOutcome>;
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
	commit(change: ConfirmedChangeInput<T>): void;
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
	const loadedState = createReactiveCollection<T>();
	const orgIdVal = createReactiveValue('');
	const loadingVal = createReactiveValue(true);
	const writesVal = createReactiveValue(0);
	let writes = 0;
	const log = createMutationLog<T>();
	let organizationVersion = 0;
	let loadedLifetime = organizationLifetime();
	let loadVersion = 0;
	let confirmedChanges: ConfirmedChange<T>[] = [];
	let openReads: { since: number }[] = [];
	let prunedThrough = 0;
	let supersededBefore = 0;

	// A response can arrive well after its request left, so keep recent changes and any an open read needs.
	function pruneConfirmedChanges() {
		const expired = Date.now() - CONFIRMED_CHANGE_RETENTION_MS;
		const needed = Math.min(...openReads.map((read) => read.since));
		while (
			confirmedChanges.length > 0 &&
			confirmedChanges[0].confirmedAt <= expired &&
			confirmedChanges[0].sequence <= needed
		) {
			prunedThrough = confirmedChanges[0].sequence;
			confirmedChanges = confirmedChanges.slice(1);
		}
	}

	function commit(change: ConfirmedChangeInput<T>) {
		confirmedChanges.push({ ...change, sequence: nextConfirmedSequence(), confirmedAt: Date.now() });
		pruneConfirmedChanges();
		loadedState.set(applyConfirmedChange(loadedState.getSnapshot(), change));
		writesVal.set(++writes);
	}

	// Writers outside this module only report a new array, so their change is the difference.
	const serverState: typeof loadedState = {
		get items() {
			return loadedState.items;
		},
		getSnapshot: () => loadedState.getSnapshot(),
		set(next) {
			const previous = loadedState.getSnapshot();
			const previousById: Record<string, T> = Object.create(null);
			for (const item of previous) previousById[item.id] = item;
			const nextIds: Record<string, true> = Object.create(null);
			for (const item of next) nextIds[item.id] = true;
			commit({
				saved: next.filter((item) => previousById[item.id] !== item),
				deleted: previous.filter((item) => !nextIds[item.id]).map((item) => item.id)
			});
		}
	};

	function beginRead(since = confirmedSequence()): StoreRead<T> {
		const read = { since };
		openReads.push(read);
		return {
			reconcile(snapshot, covers) {
				if (read.since < supersededBefore) return loadedState.getSnapshot();
				if (read.since < prunedThrough) throw new SnapshotTooOldError();
				const snapshotIds: Record<string, true> = Object.create(null);
				for (const item of snapshot) snapshotIds[item.id] = true;
				let items = [
					...loadedState.getSnapshot().filter((item) => !covers(item) && !snapshotIds[item.id]),
					...snapshot
				];
				if (!openReads.includes(read)) return items;
				for (const change of confirmedChanges) {
					if (change.sequence > read.since) items = applyConfirmedChange(items, change);
				}
				return items;
			},
			close() {
				openReads = openReads.filter((open) => open !== read);
				pruneConfirmedChanges();
			}
		};
	}

	function beginAdoption(): StoreAdoption<T> {
		// A fresh number orders this read after every request that already left, even one with no change between.
		const barrier = nextConfirmedSequence();
		const read = beginRead(barrier);
		return {
			adopt(snapshot) {
				const items = read.reconcile(snapshot, () => true);
				supersededBefore = Math.max(supersededBefore, barrier);
				return items;
			},
			close: read.close
		};
	}

	// A response also goes stale when the store loads another Organization without a shell remount.
	function withinOrganization<R>(work: Promise<R>): Promise<R> {
		const version = organizationVersion;
		return withinOrganizationLifetime(work, () => version === organizationVersion);
	}

	function withinWrite<R>(
		mutationId: string,
		work: Promise<R>,
		apply: (value: R) => void,
		confirmed: (value: R) => boolean = () => true
	): Promise<R> {
		const version = organizationVersion;
		const sameLifetime = stillInOrganizationLifetime();
		const isCurrent = () => version === organizationVersion;
		const settled = work
			.then((value) => {
				if (sameLifetime() && isCurrent()) apply(value);
				return value;
			})
			.finally(() => log.resolve(mutationId));
		return withinOrganizationWrite(settled, { isCurrent, confirmed });
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
		if (!original) return 'not-saved';

		const mutationId = crypto.randomUUID();
		log.push({ type: 'remove', mutationId, targetId: id });

		return withinWrite(
			mutationId,
			adapter.remove(id),
			(result) => {
				if (result === 'deleted') {
					commit({ deleted: [id] });
				} else if (result !== 'approval_required') {
					config.onError?.('remove', undefined);
				}
			},
			(result) => result === 'deleted'
		);
	}

	async function updateImpl(id: string, data: Partial<Omit<T, 'id'>>): Promise<boolean> {
		const displayed = getDisplayItems();
		const original = displayed.find((item) => item.id === id);
		if (!original) return false;

		const mutationId = crypto.randomUUID();
		log.push({ type: 'update', mutationId, targetId: id, data: data as Partial<T> });

		await withinWrite(mutationId, adapter.update(id, data), (updated) => commit({ saved: [updated] }));
		return true;
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

		get writes() {
			return writesVal.value;
		},

		get busy() {
			return log.pending > 0;
		},

		get loading() {
			return loadingVal.value;
		},

		beginRead,
		beginAdoption,

		startLoading() {
			loadingVal.set(true);
		},

		load(newItems: T[], newOrgId: string) {
			loadVersion++;
			if (newOrgId !== orgIdVal.value || loadedLifetime !== organizationLifetime()) {
				organizationVersion++;
				log.clear();
				openReads = [];
				confirmedChanges = [];
				prunedThrough = 0;
				supersededBefore = 0;
			}
			loadedLifetime = organizationLifetime();
			loadedState.set(newItems);
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
				const created = await withinWrite(mutationId, adapter.create(data), (created) => {
					const current = loadedState.getSnapshot();
					const keptIds: Record<string, true> = Object.create(null);
					for (const item of config.beforeAdd ? config.beforeAdd(current, data).items : current)
						keptIds[item.id] = true;
					commit({ saved: [created], deleted: current.filter((item) => !keptIds[item.id]).map((item) => item.id) });
				});
				return created;
			} catch (e) {
				config.onError?.('add', e);
				throw e;
			}
		},

		async addBatch(entries: Omit<T, 'id'>[]): Promise<T[]> {
			const mutationId = crypto.randomUUID();
			const tempIds = entries.map(() => `temp-${crypto.randomUUID()}`);
			log.push({ type: 'add-batch', mutationId, tempIds, data: entries });

			try {
				const created = await withinWrite(
					mutationId,
					config.batchAdapter
						? config.batchAdapter.createBatch(entries)
						: Promise.all(entries.map((data) => adapter.create(data))),
					(created) => commit({ saved: created }),
					(created) => created.length > 0
				);
				return created;
			} catch (e) {
				config.onError?.('addBatch', e);
				throw e;
			}
		},

		async update(id, data) {
			try {
				return await updateImpl(id, data);
			} catch (e) {
				config.onError?.('update', e);
				return false;
			}
		},

		updateOrThrow: updateImpl,

		remove: removeImpl,

		async removeBool(id: string): Promise<boolean> {
			const result = await removeImpl(id);
			return result === 'deleted';
		},

		async removeBatch(ids: string[]): Promise<BatchRemovalOutcome> {
			const mutationId = crypto.randomUUID();
			log.push({ type: 'remove-batch', mutationId, targetIds: ids });

			try {
				const { deleted, completedIds } = await withinWrite(
					mutationId,
					config.batchAdapter?.removeBatch
						? config.batchAdapter.removeBatch(ids)
						: Promise.all(ids.map((id) => adapter.remove(id))).then((results) => {
								const completedIds = ids.filter((_, index) => results[index] === 'deleted');
								return { deleted: completedIds.length, completedIds };
							}),
					({ completedIds }) => commit({ deleted: completedIds }),
					({ completedIds }) => completedIds.length > 0
				);
				return completedIds.length < ids.length
					? { kind: 'partial', deleted, completedIds }
					: { kind: 'removed', deleted };
			} catch (e) {
				config.onError?.('removeBatch', e);
				return { kind: 'failed' };
			}
		},

		mergeBatchResults(inserted: T[], updated?: T[]) {
			commit({ saved: [...(updated ?? []), ...inserted] });
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
			commit({ deletedWhere: predicate });
		},

		updateLocalWhere(predicate: (item: T) => boolean, updater: (item: T) => T) {
			commit({ updatedWhere: predicate, update: updater });
		},

		appendLocal(items: T[]) {
			commit({ saved: items });
		}
	};

	const internals: StoreInternals<T> = {
		serverState,
		commit,
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
