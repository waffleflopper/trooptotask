/**
 * Status types store — the named availability statuses (e.g., "Leave", "TDY") for the org.
 *
 * Thin wrapper around `defineStore` with a single extension: `remove(id)` returns a boolean
 * instead of throwing. Loaded by the calendar and dashboard page load functions.
 * `color`/`textColor` on each entry drive cell styling in the calendar grid.
 */
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
