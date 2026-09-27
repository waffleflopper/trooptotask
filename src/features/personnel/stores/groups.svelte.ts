/**
 * Groups store — org-level list of personnel groups, sorted by `sortOrder`.
 *
 * Extends the base store with name-safe add/rename helpers.
 * `add` silently no-ops on empty strings or duplicate names (case-insensitive).
 * `rename` rejects empty or duplicate names.
 *
 * Consumed by the sidebar group selector, personnel filter, and any component that needs
 * the org's group list. Load through the org shell workspace bootstraps.
 */
import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { Group } from '$features/personnel/contracts';

interface GroupExtensions extends Record<string, unknown> {
	remove: (id: string) => Promise<boolean>;
	add: (name: string) => Promise<Group | null>;
	rename: (id: string, newName: string) => Promise<boolean>;
}

function enhance(base: Store<Group>): GroupExtensions {
	return {
		remove: base.removeBool,

		async add(name: string): Promise<Group | null> {
			if (!name.trim()) return null;
			const trimmed = name.trim();
			if (base.find((g) => g.name.toLowerCase() === trimmed.toLowerCase())) return null;
			const nextSortOrder = Math.max(-1, ...base.rawItems.map((group) => group.sortOrder)) + 1;
			return base.add({ name: trimmed, sortOrder: nextSortOrder } as Omit<Group, 'id'>);
		},

		async rename(id: string, newName: string): Promise<boolean> {
			const trimmed = newName.trim();
			if (!trimmed) return false;
			if (base.find((group) => group.id !== id && group.name.toLowerCase() === trimmed.toLowerCase())) return false;
			return base.update(id, { name: trimmed });
		}
	};
}

export const groupManagementStore = defineStore<Group, GroupExtensions>(
	{ table: 'groups', orderBy: [{ field: 'sortOrder' }] },
	enhance
);

/** Other feature lanes can read the current Organization catalog without mutating it. */
export const groupsStore: Pick<Store<Group>, 'items' | 'orgId' | 'loading'> = {
	get items() {
		return groupManagementStore.items;
	},
	get orgId() {
		return groupManagementStore.orgId;
	},
	get loading() {
		return groupManagementStore.loading;
	}
};

/** Workspace bootstraps supply the catalog snapshot without another request. */
export const groupCatalogHydration = {
	get items() {
		return groupManagementStore.items;
	},
	get orgId() {
		return groupManagementStore.orgId;
	},
	load(items: Group[], orgId: string) {
		groupManagementStore.load(items, orgId);
	},
	startLoading() {
		groupManagementStore.startLoading();
	}
};
