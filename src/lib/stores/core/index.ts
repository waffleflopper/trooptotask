export type { BeforeAddHook } from './optimistic';

export {
	buildRequestError,
	createRestAdapter,
	createMockAdapter,
	rejectedRequestMessage,
	StoreRequestError
} from './ports';
export type { ApiAdapter, BatchApiAdapter, DeleteResult } from './ports';

export { classifyWrite } from './saveOutcome';
export type { SaveOutcome, WriteOutcome } from './saveOutcome';

export {
	endOrganizationLifetime,
	organizationLifetime,
	onWriteConfirmedAfterLifetime,
	stillInOrganizationLifetime,
	withinOrganizationLifetime,
	withinOrganizationWrite
} from './lifetime.svelte';

export { createStore } from './createStore.svelte';
export type {
	BatchRemovalOutcome,
	Store,
	StoreAdoption,
	StoreConfig,
	StoreInternals,
	StoreRead
} from './createStore.svelte';

export { defineStore, tableToResource, buildComparator } from './defineStore.svelte';
export type { DefineStoreConfig } from './defineStore.svelte';

export {
	confirmedBeforeRequest,
	confirmedSequence,
	readConfirmedChangeCookies,
	SnapshotTooOldError,
	type ConfirmedChangesByTab
} from './confirmedChanges';
