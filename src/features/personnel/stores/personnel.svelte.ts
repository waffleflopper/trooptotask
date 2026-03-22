import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { Personnel } from '$lib/types';

const RANK_ORDER = [
	'PV1',
	'PV2',
	'PFC',
	'SPC',
	'CPL',
	'SGT',
	'SSG',
	'SFC',
	'MSG',
	'1SG',
	'SGM',
	'CSM',
	'WO1',
	'CW2',
	'CW3',
	'CW4',
	'CW5',
	'2LT',
	'1LT',
	'CPT',
	'MAJ',
	'LTC',
	'COL',
	'BG',
	'MG',
	'LTG',
	'GEN'
];

interface PersonnelExtensions extends Record<string, unknown> {
	addBatchResults: (inserted: Personnel[]) => void;
	removeLocal: (id: string) => void;
	updateLocalWhere: (predicate: (item: Personnel) => boolean, updater: (item: Personnel) => Personnel) => void;
	sortByRankAndName: () => Personnel[];
}

function enhance(base: Store<Personnel>): PersonnelExtensions {
	return {
		addBatchResults(inserted: Personnel[]) {
			base.appendLocal(inserted);
		},

		removeLocal(id: string) {
			base.removeLocalWhere((p) => p.id === id);
		},

		updateLocalWhere: base.updateLocalWhere,

		sortByRankAndName() {
			return [...base.rawItems].sort((a, b) => {
				const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
				if (rankDiff !== 0) return rankDiff;
				return a.lastName.localeCompare(b.lastName);
			});
		}
	};
}

export const personnelStore = defineStore<Personnel, PersonnelExtensions>({ table: 'personnel' }, enhance);
