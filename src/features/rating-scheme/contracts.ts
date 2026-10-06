import type { CapabilityMap, MembershipRole, ScopeSet } from '$lib/access/memberAccessShape';
import type { PersonnelLookup } from '$features/personnel/contracts';
import type { RatingSchemeEntry } from './rating-scheme.types';
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
	status: RatingSchemeEntry['status'];
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
	workflowStatus?: string | null;
}

export type RatingSchemePatchValues = Partial<RatingSchemeCreateValues>;

export interface RatingSchemeWriteReference {
	ratedPersonId: string | null;
	raterPersonId: string | null;
	seniorRaterPersonId: string | null;
	intermediateRaterPersonId: string | null;
	reviewerPersonId: string | null;
}

export type RatingSchemeReadinessEntry = Pick<
	RatingSchemeEntry,
	'status' | 'raterPersonId' | 'raterName' | 'seniorRaterPersonId' | 'seniorRaterName'
>;

export interface RatingSchemePersistence {
	listWorkspace(): Promise<SavedRatingSchemeEntry[]>;
	findWriteReference(id: string): Promise<RatingSchemeWriteReference | null>;
	listPersonReadiness(personnelId: string): Promise<RatingSchemeReadinessEntry[]>;
	countEntries(): Promise<number>;
	create(input: RatingSchemeCreateValues): Promise<SavedRatingSchemeEntry>;
	update(id: string, patch: RatingSchemePatchValues): Promise<SavedRatingSchemeEntry>;
	delete(id: string): Promise<void>;
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

/** Evaluation facts needed for browser-local Dashboard due calculations. */
export interface RatingSchemeDueEntry {
	ratingPeriodEnd: string;
	status: 'active' | 'completed' | 'change-of-rater';
}

/** Trusted request facts supplied after Organization admission. */
export interface RatingSchemeDueActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: MembershipRole;
	readonly isPrivileged: boolean;
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
}

/** Optional Dashboard projection governed by Rating Scheme's own lane and row scope. */
export interface RatingSchemeDuePort {
	listDueEntries(actor: RatingSchemeDueActor): Promise<RatingSchemeDueEntry[]>;
}

export { getRatingDueStatus } from './utils/ratingScheme';

export type { RatingSchemeSupportReader } from './supportReadTypes';
