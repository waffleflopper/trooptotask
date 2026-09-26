import { z } from 'zod';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { Personnel, PersonnelLookup } from '$lib/types';

/** Stable Organization Group identity and display order. */
export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

/** Read-only rank meaning and ordering shared with other feature lanes. */
export { BUILT_IN_RANK_CATALOG, compareRankCodes, resolveBuiltInRank } from './rankCatalog';
export type { RankCatalogEntry, RankCategory, RankPayGrade, RankService, RankState } from './rankCatalog';
export { observedRankCodesForOptions, rankCodesForOptions } from './rankOptions';
export { comparePersonnelByCatalogRankThenName, comparePersonnelByRankThenName } from './personnelRank';
export type {
	OrganizationRankCatalogEntry,
	OrganizationRankCatalogReferenceSummary,
	OrganizationRankCatalogSource
} from './rankCatalogContracts';

/** Canonical Personnel facts used when saving a Sign-in Roster snapshot. */
export interface SignInRosterPersonnelLookupRecord {
	id: string;
	rank: string | null;
	lastName: string | null;
	firstName: string | null;
	groupId: string | null;
	groupName: string | null;
}

export interface SignInRosterPersonnelLookupPort {
	findPersonnelForRosterSnapshot(orgId: string, personnelIds: string[]): Promise<SignInRosterPersonnelLookupRecord[]>;
}

/** Trusted request authorization facts; structurally matches the shared AuthContext. */
export interface PersonnelRosterActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isPrivileged: boolean;
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
}

export interface PersonnelCalendarRosterPort {
	listActive(actor: PersonnelRosterActor): Promise<Personnel[]>;
	listAssigneeIds(actor: PersonnelRosterActor): Promise<string[]>;
	findGroupIds(actor: PersonnelRosterActor, personnelIds: string[]): Promise<Map<string, string | null>>;
}

/** Personnel facts exposed to the Onboarding lane after Onboarding authorization. */
export interface PersonnelOnboardingRosterPort {
	listRoster(actor: PersonnelRosterActor, status: 'active' | 'all'): Promise<Personnel[]>;
	findGroupIds(actor: PersonnelRosterActor, personnelIds: string[]): Promise<Map<string, string | null>>;
}

/** Personnel facts exposed to the Training lane after purpose-specific authorization. */
export interface PersonnelTrainingRosterPort {
	listActiveForWorkspace(actor: PersonnelRosterActor): Promise<Personnel[]>;
	listActiveForReports(actor: PersonnelRosterActor): Promise<Personnel[]>;
	findGroupIdsForWrites(actor: PersonnelRosterActor, personnelIds: string[]): Promise<Map<string, string | null>>;
}

/** Active, scoped Personnel references for the independently authorized Rating Scheme lane. */
export interface PersonnelRatingSchemeRosterPort {
	listActiveReferences(actor: PersonnelRosterActor): Promise<PersonnelLookup[]>;
}

/** Narrow award acknowledgement flags visible with the Personnel roster. */
export interface PersonnelAwardAcknowledgementPort {
	listAcknowledgedPersonnelIds(actor: PersonnelRosterActor): Promise<string[]>;
}

/** Write-only operations over a single admitted Person's sensitive artifacts. */
export type PersonnelArtifactTable =
	| 'personnel_follow_ups'
	| 'counseling_records'
	| 'personnel_documents'
	| 'leader_notes';

export interface PersonnelArtifactWriter {
	find<T>(table: PersonnelArtifactTable, id: string): Promise<T | null>;
	insert<T>(table: PersonnelArtifactTable, data: Record<string, unknown>): Promise<T>;
	update<T>(table: PersonnelArtifactTable, id: string, patch: Record<string, unknown>): Promise<T>;
	delete(table: PersonnelArtifactTable, id: string): Promise<void>;
	sumActiveDocumentBytes(): Promise<number>;
	/** The server implementation accepts only a File after runtime validation. */
	uploadFile(kind: 'counseling' | 'document', path: string, file: unknown): Promise<void>;
	removeFile(kind: 'counseling' | 'document', path: string): Promise<void>;
}

export interface PersonnelArtifactWritePort {
	forPerson(actor: PersonnelRosterActor, personnelId: string): Promise<PersonnelArtifactWriter>;
	forPeople(
		actor: PersonnelRosterActor,
		personnelIds: string[],
		action: 'archive' | 'restore'
	): Promise<PersonnelArtifactArchiveWriter>;
}

/** Organization governance approval of one retained counseling deletion request. */
export interface PersonnelGovernanceDeletionPort {
	deleteApprovedCounselingRecord(actor: PersonnelRosterActor, recordId: string): Promise<void>;
}

/** Raw Personnel history included only in an authorized Organization data export. */
export const PERSONNEL_ORGANIZATION_EXPORT_TABLES = [
	'personnel_extended_info',
	'counseling_records',
	'leader_notes',
	'personnel_follow_ups',
	'personnel_documents'
] as const;

export type PersonnelOrganizationExportTable = (typeof PERSONNEL_ORGANIZATION_EXPORT_TABLES)[number];

export function isPersonnelOrganizationExportTable(table: string): table is PersonnelOrganizationExportTable {
	return (PERSONNEL_ORGANIZATION_EXPORT_TABLES as readonly string[]).includes(table);
}

export interface PersonnelOrganizationExportPort {
	listRows(actor: PersonnelRosterActor, table: PersonnelOrganizationExportTable): Promise<Record<string, unknown>[]>;
}

export interface PersonnelArtifactRef {
	id: string;
	personnelId: string;
}

export interface PersonnelArtifactArchiveWriter {
	listCandidates(
		table: PersonnelArtifactTable,
		options: { archivedAt: string | null; status?: 'open' }
	): Promise<PersonnelArtifactRef[]>;
	update(table: PersonnelArtifactTable, row: PersonnelArtifactRef, patch: Record<string, unknown>): Promise<void>;
}

/** Personnel facts exposed to Critical Tasks after its own lane admission. */
export interface PersonnelCriticalTasksRosterPort {
	listActiveForReadiness(actor: PersonnelRosterActor): Promise<Personnel[]>;
	findForHistory(actor: PersonnelRosterActor, personnelId: string): Promise<Personnel | null>;
	listForBatchImport(actor: PersonnelRosterActor): Promise<Personnel[]>;
	findForCompletionWrite(
		actor: PersonnelRosterActor,
		personnelId: string
	): Promise<{ groupId: string | null; archivedAt: string | null } | null>;
}

export {
	createRosterReadModel,
	formatRosterPersonDisplayName,
	matchesRosterSearch,
	rosterGroupFilterValue
} from './rosterReadModel';
export type {
	CreateRosterReadModelInput,
	PersonnelGroup,
	RosterGroupFilterOption,
	RosterReadModel,
	RosterReadModelView,
	RosterScopeSelection,
	RosterStatus,
	RosterViewOptions
} from './rosterReadModel';

/** JSON note returned by the current Personnel page, API and archive operations. */
export interface PersonnelLeaderNote {
	id: string;
	personnelId: string;
	/** Organization member label, stored author fallback, or Unknown leader. */
	author: string;
	/** YYYY-MM-DD, derived from createdAt. */
	date: string;
	text: string;
	/** Timestamp string. */
	createdAt: string;
	/** Timestamp string when archived; null when active. */
	archivedAt: string | null;
}

export const personnelLeaderNoteInputSchema = z.object({
	personnelId: z.string().min(1),
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

export type PersonnelLeaderNoteInput = z.infer<typeof personnelLeaderNoteInputSchema>;
