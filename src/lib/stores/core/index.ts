export type { BeforeAddHook } from './optimistic';

export { createRestAdapter, createMockAdapter } from './ports';
export type { ApiAdapter, BatchApiAdapter } from './ports';

export { createStore } from './createStore.svelte';
export type { Store, StoreConfig, StoreInternals } from './createStore.svelte';

export { defineStore, tableToResource, buildComparator } from './defineStore.svelte';
export type { DefineStoreConfig } from './defineStore.svelte';
