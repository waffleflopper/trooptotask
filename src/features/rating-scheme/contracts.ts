import type { CapabilityMap, MembershipRole, GroupCoverage } from '$lib/access/memberAccessShape';
import type { PersonnelLookup } from '$features/personnel/contracts';
import type { RatingSchemeEntry, WorkflowStatus } from './rating-scheme.types';
import type {
	FeatureLanePolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyResource
} from '$lib/access/policyEvaluator';

/** Delivery supplies advisory UI decisions; server operations still enforce policy. */
export interface RatingSchemeAffordance {
	readonly allowed: boolean;
	readonly visible: boolean;
	readonly disabled: boolean;
	readonly explanation: string;
}
export interface RatingSchemePageAccess {
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => RatingSchemeAffordance;
	readonly affordanceForGovernanceAction: (
		action: OrganizationGovernancePolicyAction,
		resource?: PolicyResource
	) => RatingSchemeAffordance;
}

export type {
	PersonnelActiveEvaluation,
	RatingSchemeEntry,
	RatingDueStatus,
	WorkflowStatus,
	WorkflowStatusOption,
	ReportType,
	ReportTypeOption
} from './rating-scheme.types';
export {
	OER_REPORT_TYPES,
	NCOER_REPORT_TYPES,
	WOER_REPORT_TYPES,
	WORKFLOW_STATUS_OPTIONS,
	WORKFLOW_STATUS_COLORS,
	RATING_STATUS_COLORS
} from './rating-scheme.types';

export const RATING_SCHEME_WORKSPACE_LANE_KEY = 'ratingScheme' as const;

/** Authorized Evals facts; Personnel owns the active reference lookup. */
export interface RatingSchemeWorkspaceData {
	personnelLookup: PersonnelLookup[];
	ratingSchemeEntries: RatingSchemeEntry[];
}

/** One entry with the roster references its editor offers. */
export interface RatingSchemeEntryEditorData {
	entry: RatingSchemeEntry;
	personnelLookup: PersonnelLookup[];
}

export interface SavedRatingSchemeEntry extends RatingSchemeEntry {
	readonly organization_id: string;
	readonly created_at: string;
	readonly updated_at: string;
}

export interface RatingSchemeCreateValues {
	ratedPersonId: string;
	evalType: RatingSchemeEntry['evalType'];
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	raterPersonId?: string | null;
	raterName?: string | null;
	seniorRaterPersonId?: string | null;
	seniorRaterName?: string | null;
	intermediateRaterPersonId?: string | null;
	intermediateRaterName?: string | null;
	reviewerPersonId?: string | null;
	reviewerName?: string | null;
	notes?: string | null;
	reportType?: string | null;
}

export type RatingSchemePatchValues = Partial<RatingSchemeCreateValues>;

export interface RatingSchemeWriteReference {
	ratedPersonId: string;
	raterPersonId: string | null;
	seniorRaterPersonId: string | null;
	intermediateRaterPersonId: string | null;
	reviewerPersonId: string | null;
}

/** The current rater's last day closes this evaluation as a Change of Rater; the new rater starts the next one. */
export interface RatingSchemeRaterChange {
	changeDate: string;
	raterPersonId: string | null;
	raterName: string | null;
}

export interface RatingSchemeTransition {
	entry: SavedRatingSchemeEntry;
	/** False when the evaluation was already at the requested step. */
	moved: boolean;
}

export interface RatingSchemeRaterChangeResult {
	entry: SavedRatingSchemeEntry;
	/** Null when the evaluation was already completed, so nothing changed. */
	successor: SavedRatingSchemeEntry | null;
}

export interface RatingSchemePersistence {
	listWorkspace(): Promise<SavedRatingSchemeEntry[]>;
	findWriteReference(id: string): Promise<RatingSchemeWriteReference | null>;
	/** The rated Person's entries, newest rating period end first. */
	listPersonReadiness(personnelId: string): Promise<SavedRatingSchemeEntry[]>;
	countEntries(): Promise<number>;
	create(input: RatingSchemeCreateValues): Promise<SavedRatingSchemeEntry>;
	update(id: string, patch: RatingSchemePatchValues): Promise<SavedRatingSchemeEntry | null>;
	delete(id: string): Promise<void>;
	transition(id: string, to: WorkflowStatus | null): Promise<RatingSchemeTransition>;
	changeRater(id: string, change: RatingSchemeRaterChange): Promise<RatingSchemeRaterChangeResult>;
}

export type RatingSchemeWorkspaceHydrationMode = 'replace' | 'preserve-client';
export interface RatingSchemeWorkspaceHydrationTarget<T> {
	mode: RatingSchemeWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
}
export interface RatingSchemeWorkspaceHydration {
	orgId: string;
	ratingSchemeEntries: RatingSchemeWorkspaceHydrationTarget<RatingSchemeEntry>;
}
export interface RatingSchemeWorkspaceResult {
	laneKey: typeof RATING_SCHEME_WORKSPACE_LANE_KEY;
	data: RatingSchemeWorkspaceData;
	hydration: RatingSchemeWorkspaceHydration;
}
export interface RatingSchemeWorkspaceRestricted {
	laneKey: typeof RATING_SCHEME_WORKSPACE_LANE_KEY;
	access: 'restricted';
}
export interface RatingSchemeWorkspaceRouteData {
	ratingScheme: { data: Promise<RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted> };
}

/** Evaluation facts the Dashboard needs to bucket due dates and name an overdue entry; evaluators and notes stay out. */
export interface RatingSchemeDueEntry {
	id: string;
	ratedPersonId: string;
	ratedPersonName?: string;
	evalType: 'OER' | 'NCOER' | 'WOER';
	ratingPeriodEnd: string;
	workflowStatus: WorkflowStatus | null;
}

/** Trusted request facts supplied after Organization admission. */
export interface RatingSchemeDueActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: MembershipRole;
	readonly isPrivileged: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: GroupCoverage;
}

/** Optional Dashboard projection governed by Rating Scheme's own lane and row scope. */
export interface RatingSchemeDuePort {
	listDueEntries(actor: RatingSchemeDueActor): Promise<RatingSchemeDueEntry[]>;
}

export { getRatingDueStatus } from './utils/ratingScheme';
export { isEvaluationCompleted, parseWorkflowStatus } from './utils/evaluationWorkflow';
export { isArchivedPerson, toArchivedPersonIds } from './archivedPeople';
export type { ArchivedPersonIds } from './archivedPeople';

export type { RatingSchemeSupportReader } from './supportReadTypes';
