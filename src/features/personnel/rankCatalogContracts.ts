import type { RankCatalogEntry, RankService, RankState } from './rankCatalog';

export type OrganizationRankCatalogSource = 'built-in' | 'discovered' | 'custom';

export interface OrganizationRankCatalogEntry extends RankCatalogEntry {
	organizationId: string;
	source: OrganizationRankCatalogSource;
}

export type SaveOrganizationRankCatalogEntryInput = Omit<RankCatalogEntry, 'source'> & {
	intent?: 'create' | 'update' | 'upsert';
	originalCode?: string;
};

export interface AddOrganizationRankServicePackResult {
	service: RankService;
	addedCount: number;
	skippedExistingCount: number;
	entries: OrganizationRankCatalogEntry[];
}

export interface BulkSetOrganizationRankCatalogStateResult {
	service: RankService;
	targetState: RankState;
	changedCount: number;
	entries: OrganizationRankCatalogEntry[];
}

export interface OrganizationRankCatalogActiveReferences {
	personnel: number;
	trainingApplicability: number;
	total: number;
}

export interface OrganizationRankCatalogHistoricalReferences {
	signInRosterFilters: number;
	signInRosterSnapshots: number;
	total: number;
}

export interface OrganizationRankCatalogReferenceSummary {
	code: string;
	activeReferences: OrganizationRankCatalogActiveReferences;
	historicalReferences: OrganizationRankCatalogHistoricalReferences;
	canDelete: boolean;
}
