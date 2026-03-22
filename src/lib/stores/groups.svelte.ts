import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';

export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

interface GroupExtensions extends Record<string, unknown> {
	readonly names: string[];
	remove: (id: string) => Promise<boolean>;
	add: (name: string) => Promise<Group | null>;
	rename: (id: string, newName: string) => Promise<boolean>;
	getByName: (name: string) => Group | undefined;
}

function enhance(base: Store<Group>): GroupExtensions {
	return {
		get names() {
			return base.rawItems.map((g) => g.name);
		},

		remove: base.removeBool,

		async add(name: string): Promise<Group | null> {
			if (!name.trim()) return null;
			const trimmed = name.trim();
			if (base.find((g) => g.name.toLowerCase() === trimmed.toLowerCase())) return null;
			return base.add({ name: trimmed, sortOrder: base.rawItems.length } as Omit<Group, 'id'>);
		},

		async rename(id: string, newName: string): Promise<boolean> {
			if (!newName.trim()) return false;
			return base.update(id, { name: newName.trim() });
		},

		getByName(name: string) {
			return base.find((g) => g.name.toLowerCase() === name.toLowerCase());
		}
	};
}

export const groupsStore = defineStore<Group, GroupExtensions>(
	{ table: 'groups', orderBy: [{ field: 'sortOrder' }] },
	enhance
);
