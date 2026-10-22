import type { RankCatalogEntry } from '$features/personnel/contracts';

let items = $state.raw<RankCatalogEntry[]>([]);
let orgId = $state('');

/** The Organization's rank catalog, hydrated with the Calendar workspace for duty roster rank rules. */
export const calendarRankCatalogStore = {
	get items(): RankCatalogEntry[] {
		return items;
	},

	get orgId(): string {
		return orgId;
	},

	load(nextItems: RankCatalogEntry[], nextOrgId: string): void {
		items = nextItems;
		orgId = nextOrgId;
	}
};
