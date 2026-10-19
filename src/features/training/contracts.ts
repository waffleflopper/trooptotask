import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type {
	PersonnelTraining,
	TrainingCompletionHistoryEntry,
	TrainingType,
	TrainingView,
	TrainingStatus
} from './training.types';
import type { Personnel } from '$features/personnel/contracts';
import type { RankCatalogEntry, Group } from '$features/personnel/contracts';
import type { TrainingStats } from './utils/trainingStatus';
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

export type {
	TrainingType,
	TrainingView,
	PersonnelTraining,
	TrainingCompletionHistoryEntry,
	TrainingStatus
} from './training.types';

/** Matches the `training_types.color` column default and the seeded value, so a type saved without a color renders gray. */
export const DEFAULT_TRAINING_TYPE_COLOR = '#6b7280';
export { isTrainingApplicable } from './utils/applicability';
export type {
	PersonnelTrainingItem,
	PersonnelTrainingReadiness,
	TrainingApplicability
} from './utils/personnelTrainingItems';
export type { TrainingStats } from './utils/trainingStatus';
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
	/** The viewer's "YYYY-MM-DD" day that currency is judged on. */
	asOf: string;
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

export interface TrainingWorkspaceRestricted {
	laneKey: typeof TRAINING_WORKSPACE_LANE_KEY;
	access: 'restricted';
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

export type SavedTrainingType = TrainingType & {
	organization_id: string;
	created_at: string;
};

export type SavedTrainingView = TrainingView & {
	organization_id: string;
};

export type SavedTrainingCompletion = PersonnelTraining & {
	organization_id: string;
	created_at: string;
	updated_at: string;
};

export type TrainingTypeCreate = Pick<TrainingType, 'name'> & Partial<Omit<TrainingType, 'id' | 'name'>>;
export type TrainingTypePatch = Partial<Omit<TrainingType, 'id'>>;
export type TrainingViewCreate = Pick<TrainingView, 'name'> & Partial<Pick<TrainingView, 'columnIds'>>;
export type TrainingViewPatch = Partial<Pick<TrainingView, 'name' | 'columnIds'>>;
export type TrainingTypeTiming = {
	expirationMonths: number | null;
	expirationDateOnly: boolean | null;
};
export type TrainingTypeImportReference = TrainingTypeTiming & {
	id: string;
	canBeExempted: boolean | null;
	exemptPersonnelIds: string[] | null;
};
export type TrainingRankApplicabilityReference = {
	appliesToRanks: unknown;
	excludedRanks: unknown;
};

export interface TrainingCatalogPersistence {
	listTypes(): Promise<SavedTrainingType[]>;
	listViews(): Promise<SavedTrainingView[]>;
	listTypeLabels(): Promise<Array<Pick<TrainingType, 'id' | 'name'>>>;
	listRankApplicabilityReferences(): Promise<TrainingRankApplicabilityReference[]>;
	countTypesEstimated(): Promise<number>;
	findTypeByName(name: string): Promise<SavedTrainingType | null>;
	listExistingTypeNames(names: readonly string[]): Promise<string[]>;
	hasTypes(): Promise<boolean>;
	findTypeTiming(id: string): Promise<TrainingTypeTiming | null>;
	listTypeImportReferences(ids: readonly string[]): Promise<TrainingTypeImportReference[]>;
	findTypeId(id: string): Promise<Pick<TrainingType, 'id'> | null>;
	createType(input: TrainingTypeCreate): Promise<SavedTrainingType>;
	/** Resolves null when no Training type with this id exists in the Organization. */
	patchType(id: string, fields: TrainingTypePatch): Promise<SavedTrainingType | null>;
	deleteType(id: string): Promise<void>;
	createView(input: TrainingViewCreate): Promise<SavedTrainingView>;
	patchView(id: string, fields: TrainingViewPatch): Promise<SavedTrainingView | null>;
	deleteView(id: string): Promise<void>;
}

export type TrainingCompletionCreate = Pick<PersonnelTraining, 'personnelId' | 'trainingTypeId'> &
	Partial<Pick<PersonnelTraining, 'completionDate' | 'expirationDate' | 'notes' | 'certificateUrl'>>;
export type TrainingCompletionPatch = Partial<
	Pick<PersonnelTraining, 'completionDate' | 'expirationDate' | 'notes' | 'certificateUrl'>
> & { updatedAt: string };
export type TrainingCompletedUpsert = Pick<
	PersonnelTraining,
	'personnelId' | 'trainingTypeId' | 'expirationDate' | 'notes'
> & {
	completionDate?: string | null;
	updatedAt: string;
};
export type TrainingCompletionResource = Pick<PersonnelTraining, 'personnelId' | 'trainingTypeId'>;
export type TrainingCompletionPairReference = Pick<PersonnelTraining, 'id' | 'personnelId' | 'trainingTypeId'>;
export type PersonnelTrainingReadinessFact = Pick<PersonnelTraining, 'trainingTypeId' | 'expirationDate'>;
export type PersonnelTrainingExportFact = Pick<
	PersonnelTraining,
	'trainingTypeId' | 'completionDate' | 'expirationDate' | 'notes'
>;

export interface TrainingCompletionPersistence {
	listCompletions(): Promise<SavedTrainingCompletion[]>;
	findResource(id: string): Promise<TrainingCompletionResource | null>;
	findPair(personnelId: string, trainingTypeId: string): Promise<Pick<PersonnelTraining, 'id'> | null>;
	listPairReferences(
		personnelIds: readonly string[],
		trainingTypeIds: readonly string[]
	): Promise<TrainingCompletionPairReference[]>;
	listPersonReadinessFacts(personnelId: string): Promise<PersonnelTrainingReadinessFact[]>;
	listPersonExportFacts(personnelId: string): Promise<PersonnelTrainingExportFact[]>;
	listPersonCompletions(personnelId: string): Promise<PersonnelTraining[]>;
	listPersonHistory(personnelId: string): Promise<TrainingCompletionHistoryEntry[]>;
	createRecord(input: TrainingCompletionCreate): Promise<SavedTrainingCompletion>;
	patchRecord(id: string, fields: TrainingCompletionPatch): Promise<SavedTrainingCompletion>;
	deleteRecord(id: string): Promise<void>;
	upsertCompleted(rows: readonly TrainingCompletedUpsert[]): Promise<SavedTrainingCompletion[]>;
}
