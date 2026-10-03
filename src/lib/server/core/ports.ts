import type { AuditPort } from '$lib/audit/contracts';
import type {
	OrganizationSettingsReader,
	OrganizationPolicyWritePort,
	OrganizationRawExportReader
} from '$features/organization/contracts';
import type { SignInRosterFileWritePort } from '$features/sign-in-rosters/contracts';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import type { NotificationStore } from '$features/notifications/contracts.server';
import type { FeedbackExportRow } from '$features/feedback/index.server';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { CalendarAssignmentReplacementPort } from '$features/calendar/contracts';
import type { AccessRequestSetupState } from '$features/identity/contracts';
import type { SensitiveActionAuthorizer } from '$features/identity/contracts';
import type { PersonnelTrainingRosterPort } from '$features/personnel/contracts';
import type { PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';
import type { PersonnelCalendarRosterPort } from '$features/personnel/contracts';
import type { PersonnelOnboardingRosterPort } from '$features/personnel/contracts';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';
import type { RatingSchemeDuePort } from '$features/rating-scheme/contracts';
import type { PersonnelAwardAcknowledgementPort } from '$features/personnel/contracts';
import type { PersonnelArtifactWritePort } from '$features/personnel/contracts';
import type { PersonnelOrganizationExportPort } from '$features/personnel/contracts';
import type { SignInRosterPersonnelLookupPort } from '$features/personnel/contracts';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';
import type { OnboardingCalendarMarkersPort } from '$features/onboarding/contracts';
import type {
	OnboardingReconciliationPort,
	OnboardingNoteAppendPort,
	OnboardingLifecycleTransitionPort,
	OnboardingInactiveStepRemovalPort,
	OnboardingPacketCreationPort
} from '$features/onboarding/contracts';
import type { CriticalTasksReadModelPort, CriticalTasksSettingsWritePort } from '$features/critical-tasks/contracts';

/** Options for DataStore.findMany queries */
export interface FindOptions {
	orderBy?: Array<{ column: string; ascending: boolean }>;
	filters?: Record<string, unknown>;
	inFilters?: Record<string, unknown[]>;
	notInFilters?: Record<string, unknown[]>;
	/** Array containment filters: { scope_group_ids: ['g1'] } means column values must be contained by the given array */
	arrayContainedByFilters?: Record<string, unknown[]>;
	/** Require array columns to contain at least one value */
	nonEmptyArrayFilters?: string[];
	select?: string;
	limit?: number;
	/** Null-check filters: { archived_at: true } means IS NULL, false means IS NOT NULL */
	isNull?: Record<string, boolean>;
	/** Range filters for date/numeric queries */
	rangeFilters?: Array<{ column: string; op: 'gte' | 'lte' | 'gt' | 'lt'; value: string }>;
	/** Case-insensitive LIKE filters: { title: '%search%' } */
	ilikeFilters?: Record<string, string>;
	/** Pagination range (0-indexed, inclusive) */
	range?: { from: number; to: number };
	/** Count mode — used by findManyWithCount */
	count?: 'exact' | 'planned' | 'estimated';
}

/** Result from findManyWithCount — data plus total count */
export interface FindResult<T> {
	data: T[];
	count: number | null;
}

/**
 * Narrow service-role read of platform-owned Account Setup state, scoped to one Organization's
 * own Organization Invitations (ADR 0012). It returns the setup state and nothing else — no
 * applicant reason, name, or any other Access Request field ever crosses this boundary.
 */
export interface OrganizationInvitationSetupStateLookupPort {
	findSetupStateByInvitationId(orgId: string, invitationIds: string[]): Promise<Map<string, AccessRequestSetupState>>;
}

/** Scope rule for ScopedDataStore — how a table relates to personnel groups */
export type GroupScopeRule =
	| { type: 'group'; groupColumn: string }
	| { type: 'group-array'; groupColumn: string; requireNonEmpty?: boolean }
	| { type: 'personnel'; personnelColumn: string };

/** Abstracts all persistence — business logic never imports Supabase */
export interface DataStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;

	findMany<T>(table: string, orgId: string, filters?: Record<string, unknown>, options?: FindOptions): Promise<T[]>;

	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;

	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;

	/** Update a row by primary key only — no organization_id scoping.
	 *  Use for tables like `organizations` where the row IS the org. */
	updateById<T>(table: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;

	delete(table: string, orgId: string, id: string): Promise<void>;

	deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;

	deleteWhereAny(table: string, orgId: string, filterGroups: Array<Record<string, unknown>>): Promise<void>;

	deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number>;

	insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;

	upsertMany<T>(
		table: string,
		orgId: string,
		rows: Record<string, unknown>[],
		options: { onConflict: string; select?: string }
	): Promise<T[]>;

	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FindOptions
	): Promise<FindResult<T>>;
}

/** Abstracts permission enforcement — no SupabaseClient parameter needed */
export interface AuthContext {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isPrivileged: boolean;
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
}

/** Enforces resource-level Group scope checks for scoped personnel data. */
export interface ScopeEnforcementPort {
	requireGroupAccess(personnelId: string): Promise<void>;
	requireGroupAccessBatch(personnelIds: string[]): Promise<void>;
	requireGroupAccessByRecord(table: string, recordId: string, personnelIdColumn: string): Promise<void>;
}

/** Abstracts file storage operations — business logic never imports Supabase storage */
export interface StoragePort {
	upload(bucket: string, path: string, data: File | Blob | ArrayBuffer, options?: { upsert?: boolean }): Promise<void>;
	remove(bucket: string, paths: string[]): Promise<void>;
	createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
}

/** The 4 ports every standard write operation needs */
export interface WritePorts {
	store: DataStore;
	rawStore?: DataStore;
	auth: AuthContext;
	audit: AuditPort;
	calendarAssignmentReplacement: CalendarAssignmentReplacementPort;

	criticalTasksReadModel: CriticalTasksReadModelPort;
	personnelArtifactWrites?: PersonnelArtifactWritePort;
	onboardingReconciliation?: OnboardingReconciliationPort;
	onboardingNoteAppend?: OnboardingNoteAppendPort;
	onboardingLifecycleTransition?: OnboardingLifecycleTransitionPort;
	onboardingInactiveStepRemoval?: OnboardingInactiveStepRemovalPort;
	onboardingPacketCreation?: OnboardingPacketCreationPort;
	personnelTrainingRoster?: PersonnelTrainingRosterPort;
	personnelCriticalTasksRoster?: PersonnelCriticalTasksRosterPort;
	personnelCalendarRoster?: PersonnelCalendarRosterPort;
	personnelOnboardingRoster?: PersonnelOnboardingRosterPort;
	personnelRatingSchemeRoster?: PersonnelRatingSchemeRosterPort;
	trainingOnboardingReferences?: TrainingOnboardingReferencesPort;
}

/** Write + notifications (e.g., assignment type deletion, rating scheme approval) */
export interface WriteWithNotificationsPorts extends WritePorts {
	notifications: NotificationDeliveryPort;
}

/** User-scoped operations that aren't org-level writes (e.g., pinned groups) */
export interface UserWritePorts {
	store: DataStore;
	auth: AuthContext;
	audit: AuditPort;
}

/** Read-only query operations */
export interface QueryPorts {
	organizationSettings: OrganizationSettingsReader;
	store: DataStore;
	auth: AuthContext;
	criticalTasksReadModel: CriticalTasksReadModelPort;
	personnelTrainingRoster?: PersonnelTrainingRosterPort;
	personnelCriticalTasksRoster?: PersonnelCriticalTasksRosterPort;
	personnelRatingSchemeRoster?: PersonnelRatingSchemeRosterPort;
	ratingSchemeDue?: RatingSchemeDuePort;
	personnelAwardAcknowledgement?: PersonnelAwardAcknowledgementPort;
	personnelCalendarRoster?: PersonnelCalendarRosterPort;
	personnelOnboardingRoster?: PersonnelOnboardingRosterPort;
	trainingOnboardingReferences?: TrainingOnboardingReferencesPort;
	onboardingCalendarMarkers?: OnboardingCalendarMarkersPort;
}

/** Query operations needing unscoped access (e.g., shared data) */
export interface QueryWithRawStorePorts extends QueryPorts {
	rawStore: DataStore;
}

/** Combined context for all use cases */
export interface UseCaseContext {
	organizationSettings: OrganizationSettingsReader;
	organizationPolicyWrite: OrganizationPolicyWritePort;
	notificationSelf: { auth: AuthContext; audit: AuditPort; store: NotificationStore };
	feedbackExport: { listRows(orgId: string): Promise<FeedbackExportRow[]> };
	store: DataStore;
	auth: AuthContext;
	scope: ScopeEnforcementPort;
	audit: AuditPort;
	calendarAssignmentReplacement: CalendarAssignmentReplacementPort;

	notifications: NotificationDeliveryPort;
	storage: StoragePort;
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
	criticalTasksReadModel: CriticalTasksReadModelPort;
	criticalTasksSettingsWrite?: CriticalTasksSettingsWritePort;
	personnelRatingSchemeRoster?: PersonnelRatingSchemeRosterPort;
	ratingSchemeDue?: RatingSchemeDuePort;
	personnelAwardAcknowledgement?: PersonnelAwardAcknowledgementPort;
	personnelArtifactWrites?: PersonnelArtifactWritePort;
	onboardingReconciliation?: OnboardingReconciliationPort;
	onboardingNoteAppend?: OnboardingNoteAppendPort;
	onboardingLifecycleTransition?: OnboardingLifecycleTransitionPort;
	onboardingInactiveStepRemoval?: OnboardingInactiveStepRemovalPort;
	onboardingPacketCreation?: OnboardingPacketCreationPort;
	personnelOrganizationExport?: PersonnelOrganizationExportPort;
	organizationRawExport: OrganizationRawExportReader;
	signInRosterPersonnelLookup?: SignInRosterPersonnelLookupPort;
	signInRosterFileWrites?: SignInRosterFileWritePort;
	personnelTrainingRoster: PersonnelTrainingRosterPort;
	personnelCriticalTasksRoster: PersonnelCriticalTasksRosterPort;
	personnelCalendarRoster: PersonnelCalendarRosterPort;
	personnelOnboardingRoster: PersonnelOnboardingRosterPort;
	trainingOnboardingReferences: TrainingOnboardingReferencesPort;
	onboardingCalendarMarkers: OnboardingCalendarMarkersPort;
	organizationInvitationSetupStateLookup?: OrganizationInvitationSetupStateLookupPort;
	/** Unscoped DataStore — use only when business logic requires org-wide data (e.g. allPersonnel for dropdowns) */
	rawStore: DataStore;
}
