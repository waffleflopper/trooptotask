import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { PersonnelTraining, TrainingType, TrainingView, TrainingStatus } from './training.types';
import type { Personnel } from '$features/personnel/contracts';
import type { RankCatalogEntry, Group } from '$features/personnel/contracts';
import type { TrainingStats } from './utils/trainingStatus';
import type { ReadinessDashboard, ReportFilters } from './utils/reportCalculations';
import type { BriefingScope, TrainingBriefing } from './utils/trainingBriefing.types';
export {
	DEFAULT_BRIEFING_DETAIL_PAGE_SIZE,
	DEFAULT_TRAINING_BRIEFING_INPUT,
	MAX_BRIEFING_DETAIL_PAGE_SIZE,
	TRAINING_BRIEFING_HORIZONS,
	parseTrainingBriefingReportInput,
	serializeTrainingBriefingDetailInput,
	serializeTrainingBriefingReportInput
} from './utils/briefingReportInput';
export type {
	TrainingBriefingDetailInput,
	TrainingBriefingHorizon,
	TrainingBriefingReportInput
} from './utils/briefingReportInput';
import type { TrainingBriefingReportInput } from './utils/briefingReportInput';

export type { TrainingType, TrainingView, PersonnelTraining, TrainingStatus } from './training.types';
export { isTrainingApplicable } from './utils/applicability';
export type { TrainingStats } from './utils/trainingStatus';
export type { ReportFilters, ReadinessDashboard, TypeBreakdown } from './utils/reportCalculations';
export type {
	BriefingBand,
	BriefingFocusArea,
	BriefingGridRow,
	BriefingReadiness,
	BriefingRequirement,
	BriefingRowsBy,
	BriefingScope,
	FocusCandidateKey,
	TrainingBriefing,
	TrainingBriefingFilters,
	TrainingBriefingInput
} from './utils/trainingBriefing.types';

export interface TrainingBatchRecord {
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null;
	notes?: string;
	status: 'completed' | 'exempt';
}

export interface TrainingBatchImportInput {
	records: TrainingBatchRecord[];
}

export interface TrainingBatchImportResult {
	inserted: PersonnelTraining[];
	updated: PersonnelTraining[];
	exempted: Array<{ index: number; personnelId: string; trainingTypeId: string }>;
	errors: Array<{ index: number; message: string }>;
}

/** Trusted request facts for Training references consumed by Onboarding. */
export interface TrainingOnboardingActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isPrivileged: boolean;
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
}

export interface TrainingOnboardingReferencesPort {
	listTypes(actor: TrainingOnboardingActor): Promise<TrainingType[]>;
	completedTypeIds(
		actor: TrainingOnboardingActor,
		personnelIds: string[],
		trainingTypeIds: string[]
	): Promise<Map<string, Set<string>>>;
}

export interface TrainingIssue {
	personnelId: string;
	personName: string;
	typeName: string;
	label: string;
	status: TrainingStatus;
	daysUntilExpiration: number | null;
}

export interface TrainingSummary {
	stats: TrainingStats;
	issues: TrainingIssue[];
	expiredPersonnelCount: number;
	groupDelinquencies: Array<{
		groupId: string | null;
		expiredPersonnelCount: number;
		delinquentPersonnelCount: number;
	}>;
}

export interface DashboardTrainingSummary {
	trainingSummary: TrainingSummary;
	onboardingTrainingCompletions: Set<string>;
}

export interface TrainingSummaryInput {
	personnel: Personnel[];
	trainingTypes: TrainingType[];
	options?: {
		groupId?: string;
		issueLimit?: number;
		issueStatuses?: TrainingStatus[];
		includeNotCompleted?: boolean;
	};
}

export interface DashboardTrainingSummaryInput extends TrainingSummaryInput {
	onboardingPersonnelIds: string[];
}

export interface TrainingReportSort {
	column: 'name' | 'rank' | 'group' | string;
	direction: 'asc' | 'desc';
}

export interface TrainingReportPagination {
	page: number;
	pageSize: number;
}

export interface TrainingReportInput {
	filters?: ReportFilters;
	sort?: TrainingReportSort;
	pagination?: TrainingReportPagination;
}

export interface TrainingReportCell {
	trainingTypeId: string;
	status: TrainingStatus;
	label: string;
	date: string | null;
}

export interface TrainingReportRow {
	person: Personnel;
	cells: TrainingReportCell[];
}

export interface TrainingReportTrainingType {
	id: string;
	name: string;
	color: string;
}

export interface TrainingReportDetail {
	rows: TrainingReportRow[];
	totalRows: number;
	page: number;
	pageSize: number;
	totalPages: number;
	sort: TrainingReportSort;
}

export interface TrainingReportData {
	dashboard: ReadinessDashboard;
	detail: TrainingReportDetail;
	trainingTypes: TrainingReportTrainingType[];
	filterOptions: {
		groups: Group[];
		mos: string[];
		roles: string[];
		ranks: string[];
	};
}

export interface TrainingBriefingOption {
	id: string;
	name: string;
}

/** Choices drawn from the caller's authorized roster and catalog; `types` are the selected view's required columns. */
export interface TrainingBriefingFilterOptions {
	views: TrainingBriefingOption[];
	groups: TrainingBriefingOption[];
	ranks: string[];
	mos: string[];
	roles: string[];
	types: TrainingBriefingOption[];
}

export interface TrainingBriefingReportData {
	/** The request after catalog normalization; the page and its URL mirror this value. */
	input: TrainingBriefingReportInput;
	organizationName: string;
	briefing: TrainingBriefing;
	filterOptions: TrainingBriefingFilterOptions;
}

export interface TrainingBriefingDetailRow {
	personId: string;
	rank: string;
	name: string;
	groupName: string;
	typeId: string;
	typeName: string;
	status: TrainingStatus;
	label: string;
	expirationDate: string | null;
	lapseDate: string | null;
	lapsesInHorizon: boolean;
}

export interface TrainingBriefingDetail {
	scope: BriefingScope;
	rows: TrainingBriefingDetailRow[];
	totalRows: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface TrainingReportWorkbookExport {
	buffer: ArrayBuffer;
	filename: string;
}

export const TRAINING_WORKSPACE_LANE_KEY = 'training' as const;
export type TrainingWorkspaceItems<T> = T[] | Promise<T[]>;
export interface TrainingWorkspaceData {
	personnelTrainings: TrainingWorkspaceItems<PersonnelTraining>;
	trainingTypes: TrainingWorkspaceItems<TrainingType>;
	trainingViews: TrainingWorkspaceItems<TrainingView>;
	personnel: TrainingWorkspaceItems<Personnel>;
	groups: TrainingWorkspaceItems<Group>;
	pinnedGroups: TrainingWorkspaceItems<string>;
	rankCatalog?: TrainingWorkspaceItems<RankCatalogEntry>;
}
export type TrainingWorkspaceHydrationMode = 'replace' | 'preserve-client';
export interface TrainingWorkspaceHydrationTarget<T> {
	mode: TrainingWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: TrainingWorkspaceItems<T>;
}
export interface TrainingWorkspaceHydration {
	orgId: string;
	personnel: TrainingWorkspaceHydrationTarget<Personnel>;
	groups: TrainingWorkspaceHydrationTarget<Group>;
	trainingTypes: TrainingWorkspaceHydrationTarget<TrainingType>;
	trainingViews: TrainingWorkspaceHydrationTarget<TrainingView>;
	personnelTrainings: TrainingWorkspaceHydrationTarget<PersonnelTraining>;
	pinnedGroups: TrainingWorkspaceHydrationTarget<string>;
	rankCatalog?: TrainingWorkspaceHydrationTarget<RankCatalogEntry>;
}
export interface TrainingWorkspaceResult {
	laneKey: typeof TRAINING_WORKSPACE_LANE_KEY;
	data: TrainingWorkspaceData;
	hydration: TrainingWorkspaceHydration;
}

import type { FeatureLanePolicyAction, PolicyResource, PolicyDecision } from '$lib/access/policyEvaluator';
export interface TrainingAffordance {
	readonly allowed: boolean;
	readonly visible: boolean;
	readonly disabled: boolean;
	readonly reason: PolicyDecision['reasonCode'];
	readonly explanation: string;
	readonly decision: PolicyDecision;
}
export interface TrainingPageAccess {
	readonly orgId: string;
	readonly orgUrlSegment?: string;
	readonly scopeSet: ScopeSet;
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => TrainingAffordance;
}
export type TrainingMatrixViewMode = 'alphabetical' | 'by-group';
export interface TrainingPagePreferences {
	selectedGroupId: string | null;
	selectedViewId: string | null;
	matrixViewMode: TrainingMatrixViewMode;
}
export interface TrainingPreferencesPatch {
	training?: Partial<TrainingPagePreferences>;
}

export type { TrainingSupportReader } from './supportReadTypes';
