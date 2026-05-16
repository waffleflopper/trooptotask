/**
 * Roster read model — shared org roster data for cross-feature reads.
 *
 * Feature surfaces should import `rosterStore` when they need to read the current
 * roster. Personnel-owned write workflows use `personnelStore`, which is the same
 * underlying store exposed from the Personnel feature.
 */
import { PERSONNEL_RANK_ORDER } from '$lib/domain/personnelRank';
import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { Personnel } from '$lib/types';

export interface RosterStoreExtensions extends Record<string, unknown> {
	addBatchResults: (inserted: Personnel[]) => void;
	removeLocal: (id: string) => void;
	updateLocalWhere: (predicate: (item: Personnel) => boolean, updater: (item: Personnel) => Personnel) => void;
	sortByRankAndName: () => Personnel[];
}

export type RosterWriteStore = Store<Personnel> & RosterStoreExtensions;

export type RosterReadStore = Pick<
	RosterWriteStore,
	| 'items'
	| 'rawItems'
	| 'orgId'
	| 'busy'
	| 'loading'
	| 'load'
	| 'startLoading'
	| 'getById'
	| 'filter'
	| 'find'
	| 'sortByRankAndName'
>;

function enhance(base: Store<Personnel>): RosterStoreExtensions {
	const ascendingRankOrder: string[] = [...PERSONNEL_RANK_ORDER].reverse();

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
				const rankDiff = ascendingRankOrder.indexOf(a.rank) - ascendingRankOrder.indexOf(b.rank);
				if (rankDiff !== 0) return rankDiff;
				return a.lastName.localeCompare(b.lastName);
			});
		}
	};
}

export const rosterWriteStore: RosterWriteStore = defineStore<Personnel, RosterStoreExtensions>(
	{ table: 'personnel' },
	enhance
);

export const rosterStore: RosterReadStore = rosterWriteStore;
