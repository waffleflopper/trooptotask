import { createCrudStore } from '$lib/stores/crudStore.svelte';

export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

const store = createCrudStore<Group>({ resource: 'groups' });

export const groupsStore = {
	get list() {
		return store.items;
	},

	get names() {
		return store.getItems().map((g) => g.name);
	},

	load: store.load,
	remove: store.removeBool,

	async add(name: string): Promise<Group | null> {
		if (!name.trim()) return null;
		const trimmedName = name.trim();

		if (store.getItems().some((g) => g.name.toLowerCase() === trimmedName.toLowerCase())) {
			return null;
		}

		return store.add({
			name: trimmedName,
			sortOrder: store.getItems().length
		} as Omit<Group, 'id'>);
	},

	async rename(id: string, newName: string): Promise<boolean> {
		if (!newName.trim()) return false;
		return store.update(id, { name: newName.trim() });
	},

	getById: (id: string) => store.getItems().find((g) => g.id === id),
	getByName: (name: string) => store.getItems().find((g) => g.name.toLowerCase() === name.toLowerCase())
};
