import type { RankCategory, RankPayGrade, RankService, RankState } from './rankCatalog';
import type { OrganizationRankCatalogSource } from './rankCatalogContracts';

export interface RankCatalogValues {
	code: string;
	label: string;
	service: RankService;
	category: RankCategory;
	pay_grade: RankPayGrade;
	state: RankState;
	source: OrganizationRankCatalogSource;
	sort_order: number;
}
export interface SavedRankCatalogEntry extends RankCatalogValues {
	id: string;
	organization_id: string;
	created_at?: string;
	updated_at?: string;
}
export type RankCatalogSave = RankCatalogValues & {
	id?: string;
	created_at?: string;
	updated_at?: string;
};
export interface RankCatalogPersistence {
	listEntries(): Promise<SavedRankCatalogEntry[]>;
	findEntryByCode(code: string): Promise<SavedRankCatalogEntry | null>;
	saveEntries(entries: RankCatalogSave[]): Promise<SavedRankCatalogEntry[]>;
	setStatesByCodes(codes: readonly string[], state: RankState): Promise<SavedRankCatalogEntry[]>;
	patchEntryById(
		id: string,
		values: Omit<RankCatalogValues, 'state'> & { state?: RankState }
	): Promise<SavedRankCatalogEntry>;
}
