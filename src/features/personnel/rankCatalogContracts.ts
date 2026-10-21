import type { RankCatalogEntry, RankService, RankState } from './rankCatalog';

// Failures the rank forms attach to one field. Servers emit and the settings page matches these exact strings.
export const RANK_CODE_REQUIRED_MESSAGE = 'Rank code is required';
export const RANK_LABEL_REQUIRED_MESSAGE = 'Rank label is required';
export const RANK_ALREADY_EXISTS_MESSAGE = 'Rank catalog entry already exists. Edit it instead.';
export const RANK_TIE_BREAK_WHOLE_NUMBER_MESSAGE = 'Tie-break order must be a whole number.';
export const RANK_TIE_BREAK_RANGE_MESSAGE = 'Tie-break order must fit within PostgreSQL integer range.';
export const RANK_TIE_BREAK_MIN = -2_147_483_648;
export const RANK_TIE_BREAK_MAX = 2_147_483_647;

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
