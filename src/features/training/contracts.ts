import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { PersonnelTraining, TrainingType, TrainingStatus } from './training.types';
import type { Personnel } from '$lib/types';
import type { Group } from '$features/personnel/contracts';
import type { TrainingStats } from './utils/trainingStatus';
import type { ReadinessDashboard, ReportFilters } from './utils/reportCalculations';

export type { TrainingType, TrainingView, PersonnelTraining, TrainingStatus } from './training.types';
export { isTrainingApplicable } from './utils/applicability';
export type { TrainingStats } from './utils/trainingStatus';
export type { ReportFilters, ReadinessDashboard, TypeBreakdown } from './utils/reportCalculations';

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

export interface TrainingReportWorkbookExport {
	buffer: ArrayBuffer;
	filename: string;
}
