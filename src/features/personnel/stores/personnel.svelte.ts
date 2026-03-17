import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { Personnel } from '$lib/types';

const store = createCrudStore<Personnel>({ resource: 'personnel' });

const RANK_ORDER = [
	'PV1', 'PV2', 'PFC', 'SPC', 'CPL', 'SGT', 'SSG', 'SFC', 'MSG', '1SG', 'SGM', 'CSM',
	'WO1', 'CW2', 'CW3', 'CW4', 'CW5',
	'2LT', '1LT', 'CPT', 'MAJ', 'LTC', 'COL', 'BG', 'MG', 'LTG', 'GEN'
];

export const personnelStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove,
	getById: (id: string) => store.getItems().find((p) => p.id === id),

	addBatchResults(inserted: Personnel[]) {
		store.setItems([...store.getItems(), ...inserted]);
	},

	removeLocal(id: string) {
		store.setItems(store.getItems().filter((p) => p.id !== id));
	},

	sortByRankAndName() {
		return [...store.getItems()].sort((a, b) => {
			const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
			if (rankDiff !== 0) return rankDiff;
			return a.lastName.localeCompare(b.lastName);
		});
	}
};
