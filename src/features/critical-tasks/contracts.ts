import { z } from 'zod';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';

export type { PersonnelCriticalTaskItem, PersonnelCriticalTaskReadiness } from './utils/personnelCriticalTaskItems';

export const ICT_TASK_CODE_EXISTS_MESSAGE = 'Task code already exists in this Organization';
export const ICT_COMPLETION_EXISTS_MESSAGE = 'This Person already has a completion recorded for this task on that date';
export const CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE =
	"We couldn't confirm that this was saved. Reload to check it before trying again.";
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
	ICT_TASK_SORT_ORDER_MAX,
	ICT_VALIDATION_METHODS,
	type CriticalTasksSettings,
	type IctTask,
	type IctTaskOrderChange,
	type IctValidationMethod,
	type PersonnelIctCompletion
} from './criticalTasks.types';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';

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

export interface IctTaskImportRecord {
	taskCode: string;
	title?: string;
	description?: string;
	category?: string;
	mos?: string[];
	expirationMonths?: number;
	sortOrder?: number;
}

export interface IctCompletionImportRecord {
	personnelId: string;
	ictTaskId: string;
	completedAt: string;
	validationMethod?: IctValidationMethod;
	validatedBy?: string;
	notes?: string;
}

export type IctImportRowResult<T> =
	| { kind: 'added'; record: T }
	| { kind: 'updated'; record: T }
	| { kind: 'unchanged' }
	| { kind: 'failed'; message: string };

export interface IctImportReply<T> {
	results: IctImportRowResult<T>[];
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

export const ICT_IMPORT_MAX_RECORDS = 500;
export const ICT_MOS_CODE = /^[A-Z0-9]{2,6}$/;

export const ictTaskImportRecordSchema: z.ZodType<IctTaskImportRecord> = z.object({
	taskCode: z.string().trim().min(1, 'Task code is required').max(64),
	title: z.string().trim().min(1).max(200).optional(),
	description: z.string().max(2000).optional(),
	category: z.string().max(120).optional(),
	mos: z.array(z.string().regex(ICT_MOS_CODE, 'MOS codes are 2 to 6 letters or digits')).optional(),
	expirationMonths: z.number().int().positive().optional(),
	sortOrder: z.number().int().min(0).max(ICT_TASK_SORT_ORDER_MAX).optional()
});

export const ictCompletionImportRecordSchema: z.ZodType<IctCompletionImportRecord> = z.object({
	personnelId: uuidSchema,
	ictTaskId: uuidSchema,
	completedAt: dateOnlySchema,
	validationMethod: z.enum(ICT_VALIDATION_METHODS).optional(),
	validatedBy: z.string().max(200).optional(),
	notes: z.string().max(2000).optional()
});

function importReplySchema<T>(record: z.ZodType<T>): z.ZodType<IctImportReply<T>> {
	return z.object({
		results: z.array(
			z.discriminatedUnion('kind', [
				z.object({ kind: z.literal('added'), record }),
				z.object({ kind: z.literal('updated'), record }),
				z.object({ kind: z.literal('unchanged') }),
				z.object({ kind: z.literal('failed'), message: z.string() })
			])
		)
	});
}

export const ictTaskImportReplySchema = importReplySchema(ictTaskSchema);
export const ictCompletionImportReplySchema = importReplySchema(personnelIctCompletionSchema);

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
	timeZone?: string;
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
