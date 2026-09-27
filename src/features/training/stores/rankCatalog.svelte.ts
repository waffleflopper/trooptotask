import type { RankCatalogEntry } from '$features/personnel/contracts';

let items = $state.raw<RankCatalogEntry[]>([]);
let orgId = $state('');
let loading = $state(true);

export const trainingRankCatalogStore = {
	get items(): RankCatalogEntry[] {
		return items;
	},

	get orgId(): string {
		return orgId;
	},

	get loading(): boolean {
		return loading;
	},

	load(nextItems: RankCatalogEntry[], nextOrgId: string): void {
		items = nextItems;
		orgId = nextOrgId;
		loading = false;
	},

	startLoading(): void {
		loading = true;
	}
};
