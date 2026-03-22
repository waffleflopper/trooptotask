import { createStoreWithInternals } from './createStore.svelte';
import type { Store, StoreConfig, StoreInternals } from './createStore.svelte';

export interface DefineStoreConfig<T extends { id: string }> {
	/** DB table name, e.g. 'training_types'. Derives API resource as 'training-types'. */
	table: string;
	/** Sort order using camelCase field names. Auto-generates comparator. */
	orderBy?: Array<{ field: keyof T & string; ascending?: boolean }>;
	/** Additional overrides passed to createStore (beforeAdd, adapter, etc.) */
	overrides?: Partial<StoreConfig<T>>;
}

export function tableToResource(table: string): string {
	return table.replace(/_/g, '-');
}

export function buildComparator<T>(
	orderBy: Array<{ field: keyof T & string; ascending?: boolean }>
): ((a: T, b: T) => number) | undefined {
	if (!orderBy || orderBy.length === 0) return undefined;

	return (a: T, b: T) => {
		for (const { field, ascending = true } of orderBy) {
			const aVal = a[field as keyof T];
			const bVal = b[field as keyof T];

			// Nulls last when ascending, first when descending
			if (aVal == null && bVal == null) continue;
			if (aVal == null) return ascending ? 1 : -1;
			if (bVal == null) return ascending ? -1 : 1;

			let cmp: number;
			if (typeof aVal === 'string' && typeof bVal === 'string') {
				cmp = aVal.localeCompare(bVal);
			} else {
				cmp = (aVal as number) < (bVal as number) ? -1 : (aVal as number) > (bVal as number) ? 1 : 0;
			}

			if (cmp !== 0) return ascending ? cmp : -cmp;
		}
		return 0;
	};
}

export function defineStore<T extends { id: string }>(config: DefineStoreConfig<T>): Store<T>;
export function defineStore<T extends { id: string }, E extends Record<string, unknown>>(
	config: DefineStoreConfig<T>,
	enhance: (base: Store<T>) => E
): Store<T> & E;
export function defineStore<T extends { id: string }, E extends Record<string, unknown>>(
	config: DefineStoreConfig<T>,
	enhance: (base: Store<T>, internals: StoreInternals<T>) => E
): Store<T> & E;
export function defineStore<T extends { id: string }, E extends Record<string, unknown>>(
	config: DefineStoreConfig<T>,
	enhance?: ((base: Store<T>) => E) | ((base: Store<T>, internals: StoreInternals<T>) => E)
): Store<T> | (Store<T> & E) {
	const resource = tableToResource(config.table);
	const sort = config.orderBy && config.orderBy.length > 0 ? buildComparator<T>(config.orderBy) : undefined;

	const storeConfig: StoreConfig<T> = {
		resource,
		sort,
		...config.overrides
	};

	const { store, internals } = createStoreWithInternals(storeConfig);

	if (!enhance) return store;

	// Always pass both arguments — Tier 2 callers simply ignore the second.
	// This avoids fragile Function.length detection which breaks with default params.
	const extensions = (enhance as (base: Store<T>, internals: StoreInternals<T>) => E)(store, internals);
	const merged = Object.create(null) as Store<T> & E;

	// Copy base store — preserving getters
	for (const key of Object.keys(Object.getOwnPropertyDescriptors(store)) as (keyof Store<T>)[]) {
		const desc = Object.getOwnPropertyDescriptor(store, key);
		if (desc) Object.defineProperty(merged, key, desc);
	}
	// Copy prototype properties (methods defined on the store object literal)
	let proto = Object.getPrototypeOf(store);
	while (proto && proto !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			if (key === 'constructor') continue;
			if (!Object.prototype.hasOwnProperty.call(merged, key)) {
				const desc = Object.getOwnPropertyDescriptor(proto, key);
				if (desc) Object.defineProperty(merged, key, desc);
			}
		}
		proto = Object.getPrototypeOf(proto);
	}

	// Copy extensions — enhanced methods override base if same name
	for (const key of Object.keys(extensions)) {
		const desc = Object.getOwnPropertyDescriptor(extensions, key);
		if (desc) Object.defineProperty(merged, key, desc);
	}

	return merged;
}
