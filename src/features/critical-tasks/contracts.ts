import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';

export type CriticalTasksAffordance = Pick<ClientAffordance, 'allowed' | 'visible'>;

/** Live advisory decisions supplied by Delivery; server operations enforce policy. */
export interface CriticalTasksPageAccess {
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => CriticalTasksAffordance;
}

import type { IctReportDashboard, IctReportFilters, IctReportScope } from './utils/ictReports';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from './criticalTasks.types';

export type PersonnelIctCompletionWrite = Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>;

export type IctTaskCreate = Pick<IctTask, 'taskCode' | 'title'> &
	Partial<Omit<IctTask, 'id' | 'createdAt' | 'taskCode' | 'title'>>;
export type IctTaskPatch = Partial<IctTaskCreate>;

export interface CriticalTaskReference {
	id: string;
	archivedAt: string | null;
}

export interface CriticalTaskLibraryPersistence {
	listCatalog(options?: { includeArchived?: boolean }): Promise<IctTask[]>;
	listImportCandidates(): Promise<IctTask[]>;
	listReferenced(ids: string[]): Promise<IctTask[]>;
	findReference(id: string): Promise<CriticalTaskReference | null>;
	create(input: IctTaskCreate): Promise<IctTask>;
	createMany(inputs: IctTaskCreate[]): Promise<IctTask[]>;
	update(id: string, patch: IctTaskPatch): Promise<IctTask>;
}

export interface IctCompletionImportMappedRow {
	rowNumber: number;
	values: Record<string, string>;
}

export interface IctCompletionBatchImportInput {
	records: IctCompletionImportMappedRow[];
}

export interface IctCompletionBatchImportError {
	rowNumber: number;
	personnelName: string;
	taskCode: string;
	message: string;
}

export interface IctCompletionBatchImportResult {
	inserted: PersonnelIctCompletion[];
	updated: PersonnelIctCompletion[];
	errors: IctCompletionBatchImportError[];
}

export interface CriticalTasksSettingsWritePort {
	saveDefaults(
		orgId: string,
		defaults: { defaultExpirationMonths: number | null; expiringSoonWarningDays: number | null }
	): Promise<void>;
}

export const CRITICAL_TASKS_WORKSPACE_LANE_KEY = 'critical-tasks' as const;

type CriticalTasksWorkspaceItems<T> = T[] | Promise<T[]>;

export interface CriticalTasksWorkspaceData {
	settings: CriticalTasksSettings;
	personnel: CriticalTasksWorkspaceItems<Personnel>;
	groups: CriticalTasksWorkspaceItems<Group>;
	ictTasks: CriticalTasksWorkspaceItems<IctTask>;
	personnelIctCompletions: CriticalTasksWorkspaceItems<PersonnelIctCompletion>;
}

export type CriticalTasksWorkspaceHydrationMode = 'replace' | 'preserve-client';

export interface CriticalTasksWorkspaceHydrationTarget<T> {
	mode: CriticalTasksWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: CriticalTasksWorkspaceItems<T>;
}

export interface CriticalTasksWorkspaceHydration {
	orgId: string;
	personnel: CriticalTasksWorkspaceHydrationTarget<Personnel>;
	groups: CriticalTasksWorkspaceHydrationTarget<Group>;
	ictTasks: CriticalTasksWorkspaceHydrationTarget<IctTask>;
	personnelIctCompletions: CriticalTasksWorkspaceHydrationTarget<PersonnelIctCompletion>;
}

export interface CriticalTasksWorkspaceResult {
	laneKey: typeof CRITICAL_TASKS_WORKSPACE_LANE_KEY;
	data: CriticalTasksWorkspaceData;
	hydration: CriticalTasksWorkspaceHydration;
}

export type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion,
	CriticalTasksPersonnelHistoryData
} from './criticalTasks.types';

export interface CriticalTasksReadModelFilters {
	personnelIds?: string[];
	taskIds?: string[];
}

export interface CriticalTasksReadModelPort {
	findLatestCompletions(orgId: string, filters?: CriticalTasksReadModelFilters): Promise<PersonnelIctCompletion[]>;
}

export interface CriticalTasksReportInput {
	filters?: IctReportFilters;
	asOf?: string | Date;
}

export interface CriticalTasksReportsPageModel {
	initialDashboard: IctReportDashboard;
	reportScope: IctReportScope;
}

export interface CriticalTasksMatrixExportInput {
	selectedGroupId?: string;
	selectedGroupFilter?: string;
	gapsOnly?: boolean;
	search?: string;
	asOf?: string | Date;
}

export interface CriticalTasksWorkbookExport {
	buffer: ArrayBuffer;
	filename: string;
}

export type {
	IctReportDashboard,
	IctReportDashboardSummary,
	IctReportFilters,
	IctReportScope
} from './utils/ictReports';
