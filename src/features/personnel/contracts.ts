import { z } from 'zod';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { Personnel, PersonnelLookup } from './personnel.types';
import type { OrganizationRankCatalogEntry } from './rankCatalogContracts';

export type { Personnel, PersonnelLookup } from './personnel.types';

/** Stable Organization Group identity and display order. */
export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

/** Calendar status facts admitted to Personnel workspace snapshots at delivery. */
export interface PersonnelCalendarStatusSnapshot {
	id: string;
	name: string;
	color: string;
	textColor: string;
}

/** Calendar availability fields used by Personnel readiness and history export. */
export interface PersonnelAvailabilityPeriod {
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
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

/** Scoped Personnel references for the independently authorized Rating Scheme lane. */
export interface PersonnelRatingSchemeRosterPort {
	listActiveReferences(actor: PersonnelRosterActor): Promise<PersonnelLookup[]>;
	findRatedPersonGroupForWrite(
		actor: PersonnelRosterActor,
		personnelId: string
	): Promise<{ groupId: string | null } | null>;
	/** Evaluators may be archived or in another Group, but must belong to this Organization. */
	hasEvaluatorReferences(actor: PersonnelRosterActor, personnelIds: string[]): Promise<boolean>;
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
	deleteApprovedCounselingRecord(
		actor: PersonnelRosterActor,
		requestId: string,
		recordId: string,
		reviewedAt: string
	): Promise<void>;
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

export type { PersonnelLeaderNote } from './personnelLeaderNote.types';

export const personnelLeaderNoteInputSchema = z.object({
	personnelId: z.string().min(1),
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

export type PersonnelLeaderNoteInput = z.infer<typeof personnelLeaderNoteInputSchema>;

export { personnelScopeResource } from './personnelScopeResource';

export type {
	PersonnelImportRecord,
	PersonnelImportInput,
	PersonnelImportResult,
	PersonnelBatchMessage,
	PersonnelBackfillRecord,
	PersonnelBackfillInput,
	PersonnelBackfillResult
} from './personnelImport.types';

export type { ArchivePersonnelBatchResult } from './personnelArchive.types';

export const PERSONNEL_WORKSPACE_LANE_KEY = 'personnel' as const;

/** Authorized Personnel workspace facts shared by Server and Web consumers. */
export interface PersonnelWorkspaceData {
	personnel: Personnel[];
	personnelLookup: PersonnelLookup[];
	groups: Group[];
	statusTypes: PersonnelCalendarStatusSnapshot[];
	rankCatalog: OrganizationRankCatalogEntry[];
	pinnedGroups: string[];
	/** Organization loss warning window in days, defaulting to 180. */
	lossWarningWindowDays: number;
	awardTrackingAcknowledgedPersonnelIds: string[];
}

export type PersonnelWorkspaceHydrationMode = 'replace' | 'preserve-client';

export interface PersonnelWorkspaceHydrationTarget<T> {
	mode: PersonnelWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
}

export interface PersonnelWorkspaceHydration {
	orgId: string;
	personnel: PersonnelWorkspaceHydrationTarget<Personnel>;
	groups: PersonnelWorkspaceHydrationTarget<Group>;
	statusTypes: PersonnelWorkspaceHydrationTarget<PersonnelCalendarStatusSnapshot>;
	pinnedGroups: PersonnelWorkspaceHydrationTarget<string>;
}

export interface PersonnelWorkspaceResult {
	laneKey: typeof PERSONNEL_WORKSPACE_LANE_KEY;
	data: PersonnelWorkspaceData;
	hydration: PersonnelWorkspaceHydration;
}

export interface PersonnelWorkspaceRouteData {
	[PERSONNEL_WORKSPACE_LANE_KEY]: { data: Promise<PersonnelWorkspaceResult> };
}

/** Detail delivery shares the parent identity and independent streamed lanes. */
export type {
	PersonnelDetailHeader,
	PersonnelDetailStreams,
	PersonnelFollowUpsPageData,
	PersonnelCounselingsPageData,
	PersonnelDocumentsPageData,
	PersonnelNotesPageData,
	PersonnelArchivedArtifactsPageData
} from './personnel-detail.types';
export { evaluateUpcomingLosses } from './upcomingLoss';
export type { UpcomingLossRecord } from './upcomingLoss';

/** Soldier Data Sheet fields shared by its Server read and Web editor. */
export type { PersonnelExtendedInfo } from './personnelExtendedInfo.types';

const childSchema = z.object({
	name: z.string().trim().max(120),
	age: z.number().int().min(0).max(120).nullable()
});

const dateInputSchema = z
	.string()
	.trim()
	.refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use YYYY-MM-DD date format')
	.optional()
	.default('');

const dependentsInputSchema = z
	.preprocess((value) => {
		if (value === '' || value == null) return null;
		if (typeof value === 'number') return Number.isNaN(value) ? null : value;
		if (typeof value === 'string') return Number(value);
		return value;
	}, z.number().int().min(0).max(99).nullable())
	.optional()
	.default(null);

const optionalEmailInputSchema = z.string().email();

export const personnelExtendedInfoInputSchema = z.object({
	personnelId: z.string().min(1),
	bloodType: z.string().trim().max(12).optional().default(''),
	basd: dateInputSchema,
	dateOfRank: dateInputSchema,
	maritalStatus: z.string().trim().max(80).optional().default(''),
	numberOfDependents: dependentsInputSchema,
	children: z.array(childSchema).optional().default([]),
	civilianEducation: z.string().trim().max(500).optional().default(''),
	militaryEducation: z.array(z.string().trim().max(120)).optional().default([]),
	emergencyContactName: z.string().trim().max(160).optional().default(''),
	emergencyContactRelationship: z.string().trim().max(120).optional().default(''),
	emergencyContactPhone: z.string().trim().max(80).optional().default(''),
	spouseName: z.string().trim().max(160).optional().default(''),
	spousePhone: z.string().trim().max(80).optional().default(''),
	vehicleMakeModel: z.string().trim().max(160).optional().default(''),
	vehiclePlate: z.string().trim().max(40).optional().default(''),
	vehicleColor: z.string().trim().max(80).optional().default(''),
	personalEmail: z
		.string()
		.trim()
		.max(255)
		.refine(
			(value) => value === '' || optionalEmailInputSchema.safeParse(value).success,
			'Enter a valid personal email'
		)
		.optional()
		.default(''),
	personalPhone: z.string().trim().max(80).optional().default(''),
	addressStreet: z.string().trim().max(255).optional().default(''),
	addressCity: z.string().trim().max(120).optional().default(''),
	addressState: z.string().trim().max(80).optional().default(''),
	addressZip: z.string().trim().max(20).optional().default('')
});

export type {
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUpStatus,
	PersonnelFollowUp,
	PersonnelArchivedArtifact
} from './personnelArtifact.types';
