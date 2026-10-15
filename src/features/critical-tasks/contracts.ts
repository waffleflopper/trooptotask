import { z } from 'zod';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';

export const ICT_TASK_CODE_EXISTS_MESSAGE = 'Task code already exists in this Organization';
export const ICT_COMPLETION_EXISTS_MESSAGE = 'This Person already has a completion recorded for this task on that date';
export const CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE =
	"We couldn't confirm that this was saved. Reload to check it before trying again.";
export const CRITICAL_TASK_IMPORT_NOT_ATTEMPTED_MESSAGE = 'Not sent because an earlier part of the import stopped.';
export const ICT_TASK_ORDER_CHANGED_MESSAGE =
	'The task order changed before this move was saved. Reload to see the current order.';
export const ICT_TASK_UNAVAILABLE_MESSAGE =
	'That task is no longer in the active library. Reload to see the current order.';

export const ICT_TASK_MOVE_UNSUPPORTED_MESSAGE =
	'This move exceeds the supported ordering limits. Use Edit and set its Sort order instead.';

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
import {
	ICT_VALIDATION_METHODS,
	type CriticalTasksSettings,
	type IctTask,
	type IctTaskOrderChange,
	type PersonnelIctCompletion
} from './criticalTasks.types';

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
	/** Resolves null when no task with this id exists in the Organization. */
	update(id: string, patch: IctTaskPatch): Promise<IctTask | null>;
	/** Checks all participants atomically, updates changed orders only, and returns every participant, including guards. */
	reorder(changes: IctTaskOrderChange[]): Promise<IctTask[]>;
}

export type PersonnelIctCompletionCreate = Omit<PersonnelIctCompletionWrite, 'validatedBy' | 'notes'> &
	Partial<Pick<PersonnelIctCompletionWrite, 'validatedBy' | 'notes'>>;
export type PersonnelIctCompletionPatch = Partial<PersonnelIctCompletionWrite>;
export type CriticalTaskCompletionReference = Pick<PersonnelIctCompletion, 'id' | 'personnelId' | 'ictTaskId'>;
export type CriticalTaskCompletionPair = Pick<PersonnelIctCompletion, 'personnelId' | 'ictTaskId'>;

export interface CriticalTaskCompletionPersistence {
	listHistory(personnelId: string): Promise<PersonnelIctCompletion[]>;
	listReadinessHistory(personnelId: string): Promise<PersonnelIctCompletion[]>;
	listReportHistory(input: { personnelIds: string[]; taskIds: string[] }): Promise<PersonnelIctCompletion[]>;
	listImportHistory(pairs: CriticalTaskCompletionPair[]): Promise<PersonnelIctCompletion[]>;
	findReference(id: string): Promise<CriticalTaskCompletionReference | null>;
	create(input: PersonnelIctCompletionCreate): Promise<PersonnelIctCompletion>;
	createMany(inputs: PersonnelIctCompletionCreate[]): Promise<PersonnelIctCompletion[]>;
	update(id: string, patch: PersonnelIctCompletionPatch): Promise<PersonnelIctCompletion>;
	delete(id: string): Promise<void>;
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
	unconfirmed: IctCompletionBatchImportError[];
}

export interface IctCompletionImportResult extends IctCompletionBatchImportResult {
	notAttempted: IctCompletionBatchImportError[];
}

export interface IctTaskBatchImportError {
	rowNumber: number;
	taskCode: string;
	title: string;
	message: string;
}

export interface IctTaskBatchImportResult {
	inserted: IctTask[];
	updated: IctTask[];
	restored: IctTask[];
	errors: IctTaskBatchImportError[];
	unconfirmed: IctTaskBatchImportError[];
}

export interface IctTaskImportResult extends IctTaskBatchImportResult {
	notAttempted: IctTaskBatchImportError[];
}

export const ictTaskSchema: z.ZodType<IctTask> = z.object({
	id: z.string(),
	taskCode: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	category: z.string().nullish(),
	mos: z.array(z.string()),
	expirationMonths: z.number().nullable(),
	sortOrder: z.number(),
	archivedAt: z.string().nullable(),
	createdAt: z.string()
});

export const personnelIctCompletionSchema: z.ZodType<PersonnelIctCompletion> = z.object({
	id: z.string(),
	personnelId: z.string(),
	ictTaskId: z.string(),
	completedAt: z.string(),
	validationMethod: z.enum(ICT_VALIDATION_METHODS),
	validatedBy: z.string().nullable(),
	notes: z.string().nullable(),
	loggedBy: z.string().nullable(),
	createdAt: z.string()
});

const ictTaskIssueSchema: z.ZodType<IctTaskBatchImportError> = z.object({
	rowNumber: z.number(),
	taskCode: z.string(),
	title: z.string(),
	message: z.string()
});

const ictCompletionIssueSchema: z.ZodType<IctCompletionBatchImportError> = z.object({
	rowNumber: z.number(),
	personnelName: z.string(),
	taskCode: z.string(),
	message: z.string()
});

/** `unconfirmed` defaults to empty so a reply from a server that predates it still parses. */
export const ictTaskBatchImportResultSchema: z.ZodType<IctTaskBatchImportResult> = z.object({
	inserted: z.array(ictTaskSchema),
	updated: z.array(ictTaskSchema),
	restored: z.array(ictTaskSchema),
	errors: z.array(ictTaskIssueSchema),
	unconfirmed: z.array(ictTaskIssueSchema).default([])
});

export const ictCompletionBatchImportResultSchema: z.ZodType<IctCompletionBatchImportResult> = z.object({
	inserted: z.array(personnelIctCompletionSchema),
	updated: z.array(personnelIctCompletionSchema),
	errors: z.array(ictCompletionIssueSchema),
	unconfirmed: z.array(ictCompletionIssueSchema).default([])
});

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

export interface CriticalTasksWorkspaceRestricted {
	laneKey: typeof CRITICAL_TASKS_WORKSPACE_LANE_KEY;
	access: 'restricted';
}

export type {
	CriticalTasksSettings,
	IctTask,
	IctTaskOrderChange,
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
