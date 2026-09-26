import type { RankCatalogEntry } from '$features/personnel/contracts';
import { defineStore } from '$lib/stores/core';

type StoredRankCatalogEntry = RankCatalogEntry & { id: string };

const rankCatalogStore = defineStore<StoredRankCatalogEntry>({
	table: 'organization_rank_catalog'
});

function toStoredEntry(entry: RankCatalogEntry): StoredRankCatalogEntry {
	return {
		...entry,
		id: entry.code
	};
}

function toRankCatalogEntry(entry: StoredRankCatalogEntry): RankCatalogEntry {
	return {
		code: entry.code,
		label: entry.label,
		service: entry.service,
		category: entry.category,
		payGrade: entry.payGrade,
		state: entry.state,
		sortOrder: entry.sortOrder
	};
}

export const trainingRankCatalogStore = {
	get items(): RankCatalogEntry[] {
		return rankCatalogStore.items.map(toRankCatalogEntry);
	},

	get orgId(): string {
		return rankCatalogStore.orgId;
	},

	get loading(): boolean {
		return rankCatalogStore.loading;
	},

	load(items: RankCatalogEntry[], orgId: string): void {
		rankCatalogStore.load(items.map(toStoredEntry), orgId);
	},

	startLoading(): void {
		rankCatalogStore.startLoading();
	}
};
