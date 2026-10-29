/** Personnel owns one Organization-local roster backing for reads, hydration, and writes. */
import { PERSONNEL_RANK_ORDER } from '../personnelRank';
import { groupsStore } from './groups.svelte';
import { pinnedGroupsStore } from './pinnedGroups.svelte';
import { createRosterReadModel, type CreateRosterReadModelInput, type RosterReadModel } from '../rosterReadModel';
import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { Personnel } from '../personnel.types';

export type RosterReadModelStoreOptions = Pick<CreateRosterReadModelInput, 'fallbackGroupName'>;

export interface RosterStoreExtensions extends Record<string, unknown> {
	addBatchResults: (inserted: Personnel[]) => void;
	removeLocal: (id: string) => void;
	updateLocalWhere: (predicate: (item: Personnel) => boolean, updater: (item: Personnel) => Personnel) => void;
	sortByRankAndName: () => Personnel[];
	readModel: (options?: RosterReadModelStoreOptions) => RosterReadModel;
}

export type RosterWriteStore = Store<Personnel> & RosterStoreExtensions;

export type RosterReadStore = Pick<RosterWriteStore, 'items' | 'orgId' | 'loading' | 'readModel'>;

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
		},

		readModel(options = {}) {
			const inOrganization = (storeOrgId: string) => storeOrgId === base.orgId;
			return createRosterReadModel({
				personnel: base.rawItems,
				groups: inOrganization(groupsStore.orgId) ? groupsStore.items : [],
				pinnedGroupIds: inOrganization(pinnedGroupsStore.orgId) ? pinnedGroupsStore.list : [],
				...options
			});
		}
	};
}

export const personnelStore: RosterWriteStore = defineStore<Personnel, RosterStoreExtensions>(
	{ table: 'personnel' },
	enhance
);

export const rosterStore: RosterReadStore = {
	get items() {
		return personnelStore.items;
	},
	get orgId() {
		return personnelStore.orgId;
	},
	get loading() {
		return personnelStore.loading;
	},
	readModel(options) {
		return personnelStore.readModel(options);
	}
};

/** The owned entry point for workspace snapshots from other feature lanes. */
export const personnelRosterHydration = {
	get loadVersion() {
		return personnelStore.loadVersion;
	},
	get items() {
		return personnelStore.items;
	},
	get orgId() {
		return personnelStore.orgId;
	},
	load(items: Personnel[], orgId: string) {
		personnelStore.load(items, orgId);
	},
	startLoading() {
		personnelStore.startLoading();
	}
};

/** Create through the Personnel adapter while retaining the shared roster backing. */
export async function createPersonnel(data: Omit<Personnel, 'id'>): Promise<Personnel | null> {
	return personnelStore.add(data);
}
