import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { StatusType } from '$lib/types';

interface StatusTypeExtensions extends Record<string, unknown> {
	remove: (id: string) => Promise<boolean>;
}

function enhance(base: Store<StatusType>): StatusTypeExtensions {
	return {
		remove: base.removeBool
	};
}

export const statusTypesStore = defineStore<StatusType, StatusTypeExtensions>({ table: 'status_types' }, enhance);
