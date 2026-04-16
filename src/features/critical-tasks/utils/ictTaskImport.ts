import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import {
	applyMapping,
	autoMapColumns,
	detectHeaderRow,
	type ColumnDef,
	type ColumnMapping
} from '$lib/utils/columnMapping';
import { parseMosApplicabilityInput } from './ictTaskLibrary';

export type IctTaskImportMode = 'create-only' | 'upsert';
export type IctTaskImportAction = 'create' | 'update';

export type IctTaskImportPayload = Omit<IctTask, 'id' | 'createdAt'>;

export interface IctTaskImportValidRow {
	rowNumber: number;
	action: IctTaskImportAction;
	taskId: string | null;
	task: IctTaskImportPayload;
}

export interface IctTaskImportInvalidRow {
	rowNumber: number;
	values: Record<string, string>;
	errors: string[];
}

export interface IctTaskImportReview {
	validRows: IctTaskImportValidRow[];
	invalidRows: IctTaskImportInvalidRow[];
}

export interface ReviewIctTaskImportOptions {
	existingTasks: IctTask[];
	mode: IctTaskImportMode;
	nextSortOrder: number;
}

export const ICT_TASK_IMPORT_COLUMNS: ColumnDef[] = [
	{
		key: 'taskCode',
		label: 'Task Code',
		required: true,
		aliases: ['task code', 'task_code', 'task number', 'task_number', 'task', 'code']
	},
	{
		key: 'title',
		label: 'Title',
		required: true,
		aliases: ['title', 'task title', 'task_title', 'name']
	},
	{
		key: 'description',
		label: 'Description',
		required: false,
		aliases: ['description', 'desc', 'task description', 'task_description']
	},
	{
		key: 'mos',
		label: 'MOS',
		required: false,
		aliases: ['mos', 'mos applicability', 'mos_applicability', 'applicability', 'applies to mos', 'applies_to_mos']
	},
	{
		key: 'expirationMonths',
		label: 'Expiration Months',
		required: false,
		aliases: ['expiration months', 'expiration_months', 'expiration', 'expires months', 'expires_months']
	},
	{
		key: 'sortOrder',
		label: 'Sort Order',
		required: false,
		aliases: ['sort order', 'sort_order', 'order', 'sequence']
	}
];

function parseOptionalPositiveInteger(value: string): { value: number | null; error: string | null } {
	const trimmed = value.trim();
	if (!trimmed) return { value: null, error: null };
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed) || String(parsed) !== trimmed || parsed <= 0) {
		return { value: null, error: 'Expiration months must be a positive whole number' };
	}
	return { value: parsed, error: null };
}

function parseSortOrder(value: string, fallback: number): number {
	const trimmed = value.trim();
	if (!trimmed) return fallback;
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeTaskCode(value: string): string {
	return value.trim().toUpperCase();
}

function parseMosImportValue(value: string): { value: string[]; errors: string[] } {
	const mos = parseMosApplicabilityInput(value);
	const errors = mos
		.filter((code) => !/^[A-Z0-9]{2,6}$/.test(code))
		.map((code) => `MOS contains invalid code "${code}"`);

	return { value: mos, errors };
}

function existingTaskForCode(tasks: IctTask[], taskCode: string): IctTask | undefined {
	const normalized = normalizeTaskCode(taskCode);
	return tasks.find((task) => normalizeTaskCode(task.taskCode) === normalized);
}

function getDuplicateTaskCodes(dataRows: string[][], mappings: ReturnType<typeof autoMapColumns>): Set<string> {
	const counts = new Map<string, number>();
	for (const rawRow of dataRows) {
		const values = applyMapping(rawRow, mappings);
		const taskCode = normalizeTaskCode(values.taskCode ?? '');
		if (!taskCode) continue;
		counts.set(taskCode, (counts.get(taskCode) ?? 0) + 1);
	}

	return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([taskCode]) => taskCode));
}

function getMappedFields(mappings: ColumnMapping[]): Set<string> {
	return new Set(mappings.map((mapping) => mapping.fieldKey).filter((key): key is string => Boolean(key)));
}

export function reviewIctTaskImportRows(rawRows: string[][], options: ReviewIctTaskImportOptions): IctTaskImportReview {
	if (rawRows.length === 0) {
		return { validRows: [], invalidRows: [] };
	}

	const hasHeaders = detectHeaderRow(rawRows[0], ICT_TASK_IMPORT_COLUMNS);
	const mappings = autoMapColumns(rawRows[0], ICT_TASK_IMPORT_COLUMNS, hasHeaders);
	const mappedFields = getMappedFields(mappings);
	const dataRows = hasHeaders ? rawRows.slice(1) : rawRows;
	const rowNumberOffset = hasHeaders ? 2 : 1;
	const validRows: IctTaskImportValidRow[] = [];
	const invalidRows: IctTaskImportInvalidRow[] = [];
	const duplicateTaskCodes = getDuplicateTaskCodes(dataRows, mappings);

	for (const [index, rawRow] of dataRows.entries()) {
		const values = applyMapping(rawRow, mappings);
		const rowNumber = index + rowNumberOffset;
		const taskCode = normalizeTaskCode(values.taskCode ?? '');
		const title = (values.title ?? '').trim();
		const existingTask = existingTaskForCode(options.existingTasks, taskCode);
		const expirationMonths = parseOptionalPositiveInteger(values.expirationMonths ?? '');
		const mos = parseMosImportValue(values.mos ?? '');
		const errors = [
			!taskCode ? 'Task code is required' : '',
			!title ? 'Title is required' : '',
			duplicateTaskCodes.has(taskCode) ? 'Duplicate task code in import' : '',
			options.mode === 'create-only' && existingTask ? 'Task code already exists' : '',
			expirationMonths.error ?? '',
			...mos.errors
		].filter(Boolean);

		if (errors.length > 0) {
			invalidRows.push({
				rowNumber,
				values,
				errors
			});
			continue;
		}

		validRows.push({
			rowNumber,
			action: options.mode === 'upsert' && existingTask ? 'update' : 'create',
			taskId: existingTask?.id ?? null,
			task: {
				taskCode,
				title,
				description: mappedFields.has('description')
					? (values.description ?? '').trim() || null
					: (existingTask?.description ?? null),
				mos: mappedFields.has('mos') ? mos.value : (existingTask?.mos ?? []),
				expirationMonths: mappedFields.has('expirationMonths')
					? expirationMonths.value
					: (existingTask?.expirationMonths ?? null),
				sortOrder: mappedFields.has('sortOrder')
					? parseSortOrder(values.sortOrder ?? '', existingTask?.sortOrder ?? options.nextSortOrder + validRows.length)
					: (existingTask?.sortOrder ?? options.nextSortOrder + validRows.length),
				archivedAt: null
			}
		});
	}

	return { validRows, invalidRows };
}
