import type { CapabilityMap, MembershipRole, GroupCoverage } from '$lib/access/memberAccessShape';
import type { PersonnelLookup } from '$features/personnel/contracts';
import type {
	EvalType,
	Evaluation,
	EvaluatorChain,
	RatingScheme,
	ReportType,
	WorkflowStatus
} from './rating-scheme.types';
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
	EvalType,
	Evaluation,
	EvaluatorChain,
	PersonnelActiveEvaluation,
	RatingScheme,
	RatingSchemeEntry,
	RatingDueStatus,
	WorkflowStatus,
	WorkflowStep,
	ReportType,
	ReportTypeOption
} from './rating-scheme.types';
export {
	OER_REPORT_TYPES,
	NCOER_REPORT_TYPES,
	WOER_REPORT_TYPES,
	WORKFLOW_STEPS,
	RATING_STATUS_COLORS
} from './rating-scheme.types';

export const RATING_SCHEME_WORKSPACE_LANE_KEY = 'ratingScheme' as const;

/** Authorized Evals facts; Personnel owns the active reference lookup. */
export interface RatingSchemeWorkspaceData {
	personnelLookup: PersonnelLookup[];
	ratingSchemes: RatingScheme[];
	evaluations: Evaluation[];
}

/** One Evaluation and its scheme, with the roster references its editor offers. */
export interface RatingSchemeEntryEditorData {
	ratingScheme: RatingScheme;
	evaluation: Evaluation;
	personnelLookup: PersonnelLookup[];
}

/** The chain a scheme starts with or changes to; an omitted role keeps its value. */
export type EvaluatorChainValues = { [K in keyof EvaluatorChain]?: EvaluatorChain[K] };

export interface RatingSchemeCreateValues extends EvaluatorChainValues {
	ratedPersonId: string;
	evalType: EvalType;
	notes?: string | null;
}

export type RatingSchemePatchValues = Partial<RatingSchemeCreateValues>;

/** Opens an Evaluation at Drafting, or records one already completed, on a listed scheme with its current chain. */
export interface EvaluationStart {
	reportType: ReportType | null;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	completed: boolean;
	notes: string | null;
}

/** The fields of an Evaluation a save may change; its step, scheme and chain move through their own actions. */
export interface EvaluationPatchValues {
	evalType?: EvalType;
	reportType?: ReportType | null;
	ratingPeriodStart?: string;
	ratingPeriodEnd?: string;
	notes?: string | null;
}

export interface EvaluationWriteReference {
	ratingSchemeId: string;
	ratedPersonId: string;
	raterPersonId: string | null;
}

/** The current rater's last day closes this evaluation as a Change of Rater; the new rater starts the next one. */
export interface RatingSchemeRaterChange {
	changeDate: string;
	raterPersonId: string | null;
	raterName: string | null;
}

/** A workflow move names the step the caller saw, so a move from a stale view is refused. */
export interface RatingSchemeMove {
	from: WorkflowStatus | null;
	to: WorkflowStatus | null;
}

export interface EvaluationTransition {
	evaluation: Evaluation;
	/** False when the evaluation was already at the requested step. */
	moved: boolean;
}

export interface EvaluationStartResult {
	evaluation: Evaluation;
	/** False when the same Evaluation was already open, so nothing changed. */
	created: boolean;
}

export interface RatingSchemeRaterChangeResult {
	/** The completed Change of Rater evaluation, with the chain that signed it. */
	evaluation: Evaluation;
	/** The scheme with its new rater. */
	ratingScheme: RatingScheme;
	/** Null when the evaluation was already completed and no successor matches. */
	successor: Evaluation | null;
}

export interface RatingSchemeArchiveResult {
	ratingScheme: RatingScheme;
	/** False when the scheme was already archived or already listed, as asked. */
	changed: boolean;
}

export interface RatingSchemePersistence {
	listRatingSchemes(): Promise<RatingScheme[]>;
	listEvaluations(): Promise<Evaluation[]>;
	findRatingScheme(id: string): Promise<RatingScheme | null>;
	findEvaluationReference(id: string): Promise<EvaluationWriteReference | null>;
	/** The rated Person's scheme and Evaluations, newest rating period end first. */
	listPersonReadiness(personnelId: string): Promise<{ ratingSchemes: RatingScheme[]; evaluations: Evaluation[] }>;
	countRatingSchemes(): Promise<number>;
	createRatingScheme(input: RatingSchemeCreateValues): Promise<RatingScheme>;
	updateRatingScheme(id: string, patch: RatingSchemePatchValues): Promise<RatingScheme | null>;
	setRatingSchemeArchived(id: string, archived: boolean): Promise<RatingSchemeArchiveResult>;
	startEvaluation(ratingSchemeId: string, start: EvaluationStart): Promise<EvaluationStartResult>;
	updateEvaluation(id: string, patch: EvaluationPatchValues): Promise<Evaluation | null>;
	deleteEvaluation(id: string): Promise<void>;
	transitionEvaluation(id: string, move: RatingSchemeMove): Promise<EvaluationTransition>;
	changeEvaluationRater(id: string, change: RatingSchemeRaterChange): Promise<RatingSchemeRaterChangeResult>;
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
	ratingSchemes: RatingSchemeWorkspaceHydrationTarget<RatingScheme>;
	evaluations: RatingSchemeWorkspaceHydrationTarget<Evaluation>;
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

/** Evaluation facts the Dashboard needs to bucket due dates and name an overdue Evaluation; evaluators and notes stay out. */
export interface RatingSchemeDueEntry {
	id: string;
	ratedPersonId: string;
	ratedPersonName?: string;
	evalType: EvalType;
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
export { isEvaluationOpen, isOnTracker } from './utils/ratingSchemeEntries';
export type { ArchivedPersonIds } from './archivedPeople';

export type { RatingSchemeSupportReader } from './supportReadTypes';
