import type {
	CounselingRecordRow,
	PersonnelDocumentRow,
	FollowUpRow,
	LeaderNoteRow,
	CounselingCreate,
	DocumentCreate,
	FollowUpCreate,
	FollowUpPatch,
	LeaderNoteCreate
} from './personnelArtifactPersistence';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';

export type PersonnelAffordance = Pick<ClientAffordance, 'allowed'>;

/** Personnel consumes routing, scope and live advisory decisions from Delivery. */
export interface PersonnelPageAccess {
	readonly orgUrlSegment?: string;
	readonly scopeSet: ScopeSet;
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => PersonnelAffordance;
}

import type { FileCleanup, OrganizationFileUploadRegistration } from '$features/organization/contracts';
import { z } from 'zod';
import type { OrganizationAccessGrant, ScopeSet } from '$lib/access/memberAccessShape';
import type { Personnel, PersonnelLookup } from './personnel.types';
import type { OrganizationRankCatalogEntry } from './rankCatalogContracts';

export type { Personnel, PersonnelLookup } from './personnel.types';

// Failures the Personnel forms attach to one field. Servers emit and forms match these exact strings.
export const PERSONNEL_LAST_NAME_REQUIRED_MESSAGE = 'Last name is required';
export const PERSONNEL_FIRST_NAME_REQUIRED_MESSAGE = 'First name is required';

/** Stable Organization Group identity and display order. */
export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

export interface PersonnelRosterReader {
	list(options?: { status?: 'active' | 'archived' | 'all'; order?: 'archived-newest' }): Promise<Personnel[]>;
	countArchived(): Promise<number>;
}

export interface PersonnelLifecycleReference {
	rank: string;
	firstName: string;
	lastName: string;
	groupId: string | null;
	archivedAt: string | null;
}

export interface PersonnelDateCandidate {
	id: string;
	rank: string;
	firstName: string;
	lastName: string;
	groupId: string | null;
	ets: string | null;
	deros: string | null;
}

export interface PersonnelEditableFields {
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	clinicRole: string;
	ets: string | null;
	deros: string | null;
	groupId: string | null;
}

export type PersonnelInsert = Pick<PersonnelEditableFields, 'rank' | 'lastName' | 'firstName' | 'clinicRole'> &
	Partial<Pick<PersonnelEditableFields, 'mos' | 'ets' | 'deros' | 'groupId'>> & { slug: string };

export interface PersonnelRecordPersistence {
	findBySlug(slug: string): Promise<Personnel | null>;
	findById(id: string): Promise<Personnel | null>;
	findWriteReference(id: string): Promise<PersonnelLifecycleReference | null>;
	findGroupReference(id: string): Promise<{ groupId: string | null } | null>;
	listArchiveCandidates(ids: string[]): Promise<Array<PersonnelLifecycleReference & { id: string }>>;
	listImportSlugs(): Promise<Array<{ slug: string | null }>>;
	listSlugCandidates(prefix: string): Promise<Array<{ id: string; slug: string | null }>>;
	listBackfillCandidates(): Promise<PersonnelDateCandidate[]>;
	listRankReferences(): Promise<Array<{ rank?: string | null }>>;
	create(input: PersonnelInsert): Promise<Personnel>;
	createMany(inputs: PersonnelInsert[]): Promise<Personnel[]>;
	updateEditable(id: string, patch: Partial<PersonnelEditableFields> & { slug?: string }): Promise<Personnel>;
	updateDates(id: string, patch: { ets?: string; deros?: string }): Promise<Personnel>;
	delete(id: string): Promise<void>;
}

export interface GroupPersistence {
	listCatalog(): Promise<Group[]>;
	findReference(id: string): Promise<{ id: string } | null>;
	findNamesByIds(ids: string[]): Promise<Map<string, string>>;
	create(input: { name: string; sortOrder?: number }): Promise<Group>;
	update(id: string, patch: { name?: string; sortOrder?: number }): Promise<Group>;
	delete(id: string): Promise<void>;
}

export interface PinnedGroupResult {
	id: string;
	groupName: string;
	sortOrder: number;
}

export interface SelfPinPersistence {
	listNames(): Promise<string[]>;
	insert(input: { groupName: string; sortOrder?: number }): Promise<PinnedGroupResult>;
	removeName(groupName: string): Promise<void>;
	replaceNames(names: string[]): Promise<void>;
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
export { BUILT_IN_ARMY_RANK_OPTIONS, BUILT_IN_RANK_CATALOG, compareRankCodes, resolveBuiltInRank } from './rankCatalog';
export type { RankCatalogEntry, RankCategory, RankPayGrade, RankService, RankState } from './rankCatalog';
export { observedRankCodesForOptions, rankCodesForOptions } from './rankOptions';
export { comparePersonnelByCatalogRankThenName, comparePersonnelByRankThenName } from './personnelRank';
export type {
	OrganizationRankCatalogEntry,
	OrganizationRankCatalogReferenceSummary,
	OrganizationRankCatalogSource
} from './rankCatalogContracts';
export {
	RANK_ALREADY_EXISTS_MESSAGE,
	RANK_CODE_REQUIRED_MESSAGE,
	RANK_LABEL_REQUIRED_MESSAGE,
	RANK_TIE_BREAK_RANGE_MESSAGE,
	RANK_TIE_BREAK_WHOLE_NUMBER_MESSAGE
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
	/** People outside the actor's scope are omitted like missing People. */
	findPersonnelForRosterSnapshot(
		orgId: string,
		scopeSet: ScopeSet,
		personnelIds: string[]
	): Promise<SignInRosterPersonnelLookupRecord[]>;
}

export type PersonnelRosterActor = OrganizationAccessGrant;

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

/** Scope anchor and display name of a Person admitted for a lane write. */
export interface PersonnelWriteSubject {
	groupId: string | null;
	rank: string;
	lastName: string;
}

/** Personnel facts exposed to the Training lane after purpose-specific authorization. */
export interface PersonnelTrainingRosterPort {
	listActiveForWorkspace(actor: PersonnelRosterActor): Promise<Personnel[]>;
	listActiveForReports(actor: PersonnelRosterActor): Promise<Personnel[]>;
	findWriteSubjects(actor: PersonnelRosterActor, personnelIds: string[]): Promise<Map<string, PersonnelWriteSubject>>;
}

/** Scoped Personnel references for the independently authorized Rating Scheme lane. */
export interface PersonnelRatingSchemeRosterPort {
	listActiveReferences(actor: PersonnelRosterActor): Promise<PersonnelLookup[]>;
	findRatedPersonForWrite(actor: PersonnelRosterActor, personnelId: string): Promise<PersonnelWriteSubject | null>;
	/** Evaluators may be archived or in another Group, but must belong to this Organization. */
	hasEvaluatorReferences(actor: PersonnelRosterActor, personnelIds: string[]): Promise<boolean>;
}

/** Narrow award acknowledgement flags visible with the Personnel roster. */
export interface PersonnelAwardAcknowledgementPort {
	listAcknowledgedPersonnelIds(actor: PersonnelRosterActor): Promise<string[]>;
}

export interface PersonnelArtifactWriter {
	findCounseling(id: string): Promise<CounselingRecordRow | null>;
	createCounseling(input: CounselingCreate): Promise<CounselingRecordRow>;
	setCounselingArchivedAt(id: string, archivedAt: string | null): Promise<CounselingRecordRow>;
	findDocument(id: string): Promise<PersonnelDocumentRow | null>;
	createDocument(input: DocumentCreate): Promise<PersonnelDocumentRow>;
	setDocumentArchivedAt(id: string, archivedAt: string | null): Promise<PersonnelDocumentRow>;
	findFollowUp(id: string): Promise<FollowUpRow | null>;
	createFollowUp(input: FollowUpCreate): Promise<FollowUpRow>;
	patchFollowUp(id: string, input: FollowUpPatch): Promise<FollowUpRow>;
	deleteFollowUp(id: string): Promise<void>;
	findLeaderNote(id: string): Promise<LeaderNoteRow | null>;
	createLeaderNote(input: LeaderNoteCreate): Promise<LeaderNoteRow>;
	setLeaderNoteArchivedAt(id: string, archivedAt: string | null): Promise<LeaderNoteRow>;
	deleteLeaderNote(id: string): Promise<void>;
	sumActiveDocumentBytes(): Promise<number>;
	/** The server implementation accepts only a File after runtime validation. */
	uploadFile(kind: 'counseling' | 'document', path: string, file: unknown): Promise<OrganizationFileUploadRegistration>;
	/**
	 * Deletes the record only while it is still archived at `archivedAt`. A
	 * retry after the record is gone answers from its deletion receipt; null
	 * means neither applies.
	 */
	deleteArchivedFileArtifact(
		kind: 'counseling' | 'document',
		id: string,
		archivedAt: string | null
	): Promise<{ deleted: boolean; fileCleanup: FileCleanup } | null>;
	/** After an unconfirmed attachment: the record holding `path`, or null once the key is retired. */
	reconcileFileAttachment(kind: 'counseling' | 'document', path: string): Promise<string | null>;
}

export interface PersonnelArtifactWritePort {
	/** The caller admits the requester against the returned Person before revealing anything about it. */
	findCounselingPersonId(actor: PersonnelRosterActor, recordId: string): Promise<string | null>;
	forPerson(actor: PersonnelRosterActor, personnelId: string): Promise<PersonnelArtifactWriter>;
}

/**
 * Commands through the requester's own database session. Each commits the
 * Person's archive event with every event-owned Follow-up, counseling record,
 * document and Leader Note, or changes nothing. The database rechecks configure
 * access, Group scope and Organization review after any wait. A saved event is
 * never replaced, so a retry finishes an interrupted change.
 */
export interface PersonnelLifecycleCommandPort {
	/** Each admitted Person keeps its saved event, or takes `archivedAt` when active. */
	archive(personnelIds: readonly string[], archivedAt: string): Promise<void>;
	/** False when the Person is no longer archived. */
	restore(personnelId: string): Promise<boolean>;
	approveArchiveRequest(requestId: string, personnelId: string, reviewedAt: string): Promise<void>;
}

/** Organization governance approval of one retained counseling deletion request. */
export interface PersonnelGovernanceDeletionPort {
	deleteApprovedCounselingRecord(
		actor: PersonnelRosterActor,
		requestId: string,
		recordId: string,
		reviewedAt: string
	): Promise<{ fileCleanup: FileCleanup }>;
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

export interface PersonnelWorkspaceRestricted {
	laneKey: typeof PERSONNEL_WORKSPACE_LANE_KEY;
	access: 'restricted';
}

export interface PersonnelWorkspaceRouteData {
	[PERSONNEL_WORKSPACE_LANE_KEY]: { data: Promise<PersonnelWorkspaceResult | PersonnelWorkspaceRestricted> };
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
	PersonnelArchivedArtifact,
	PersonnelArtifactArchiveState,
	PersonnelFollowUpLifecycleState
} from './personnelArtifact.types';

export type { PersonnelSupportReader } from './supportReadTypes';

export interface PersonnelScopeEnforcement {
	requireGroupAccess(personnelId: string): Promise<void>;
	requireGroupAccessBatch(personnelIds: string[]): Promise<void>;
}

export type {
	RankCatalogPersistence,
	RankCatalogSave,
	RankCatalogValues,
	SavedRankCatalogEntry
} from './rankCatalogPersistence';
export type {
	PersonnelSheetPersistence,
	PersonnelWorkbookHistoryReader,
	PersonnelSheetEditableValues,
	SavedPersonnelSheet
} from './personnelSheetPersistence';
export type {
	PersonnelArtifactReadPersistence,
	CounselingRecordRow,
	PersonnelDocumentRow,
	FollowUpRow,
	LeaderNoteRow
} from './personnelArtifactPersistence';
