import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import { applyMapping, autoMapColumns, detectHeaderRow, type ColumnDef } from '$lib/utils/columnMapping';
import { parseMosApplicabilityInput } from './ictTaskLibrary';

export type IctTaskImportMode = 'create-only' | 'upsert';
export type IctTaskImportAction = 'create' | 'update';

export type IctTaskImportPayload = Omit<IctTask, 'id' | 'createdAt'>;

export interface IctTaskImportValidRow {
	rowNumber: number;
	action: IctTaskImportAction;
	restoresArchivedTask: boolean;
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

export interface IctTaskImportMappedRow {
	rowNumber: number;
	values: Record<string, string>;
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
		aliases: [
			'mos',
			"mos's",
			'moss',
			'mos applicability',
			'mos_applicability',
			'applicability',
			'applies to mos',
			'applies_to_mos'
		]
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

function buildExistingTaskCodeError(existingTask: IctTask | undefined): string {
	if (!existingTask) return '';
	if (existingTask.archivedAt) {
		return 'Task code exists on an archived task. Switch import behavior to create, update, or restore by task code.';
	}

	return 'Task code already exists';
}

interface DuplicateImportRow {
	rowNumber: number;
	taskCode: string;
	title: string;
}

function getDuplicateTaskCodeRowsForMappedRows(rows: IctTaskImportMappedRow[]): Map<string, DuplicateImportRow[]> {
	const rowsByTaskCode = new Map<string, DuplicateImportRow[]>();
	for (const row of rows) {
		const values = row.values;
		const taskCode = normalizeTaskCode(values.taskCode ?? '');
		if (!taskCode) continue;

		const rows = rowsByTaskCode.get(taskCode) ?? [];
		rows.push({
			rowNumber: row.rowNumber,
			taskCode,
			title: (values.title ?? '').trim()
		});
		rowsByTaskCode.set(taskCode, rows);
	}

	return new Map([...rowsByTaskCode.entries()].filter(([, rows]) => rows.length > 1));
}

function buildDuplicateTaskCodeError(
	rowNumber: number,
	taskCode: string,
	duplicates: Map<string, DuplicateImportRow[]>
): string {
	const conflicts = duplicates.get(taskCode) ?? [];
	const otherRow = conflicts.find((row) => row.rowNumber !== rowNumber);
	if (!otherRow) {
		return `Duplicate task code "${taskCode}" in import`;
	}

	const titleSuffix = otherRow.title ? ` ("${otherRow.title}")` : '';
	return `Duplicate task code "${taskCode}" also appears on row ${otherRow.rowNumber}${titleSuffix}`;
}

export function reviewMappedIctTaskImportRows(
	rows: IctTaskImportMappedRow[],
	options: ReviewIctTaskImportOptions
): IctTaskImportReview {
	if (rows.length === 0) {
		return { validRows: [], invalidRows: [] };
	}

	const validRows: IctTaskImportValidRow[] = [];
	const invalidRows: IctTaskImportInvalidRow[] = [];
	const duplicateTaskCodeRows = getDuplicateTaskCodeRowsForMappedRows(rows);

	for (const row of rows) {
		const values = row.values;
		const rowNumber = row.rowNumber;
		const taskCode = normalizeTaskCode(values.taskCode ?? '');
		const title = (values.title ?? '').trim();
		const existingTask = existingTaskForCode(options.existingTasks, taskCode);
		const expirationMonths = parseOptionalPositiveInteger(values.expirationMonths ?? '');
		const mos = parseMosImportValue(values.mos ?? '');
		const mappedFields = new Set(Object.keys(values));
		const errors = [
			!taskCode ? 'Task code is required' : '',
			!title ? 'Title is required' : '',
			duplicateTaskCodeRows.has(taskCode)
				? buildDuplicateTaskCodeError(rowNumber, taskCode, duplicateTaskCodeRows)
				: '',
			options.mode === 'create-only' ? buildExistingTaskCodeError(existingTask) : '',
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
			restoresArchivedTask: Boolean(existingTask?.archivedAt),
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

export function reviewIctTaskImportRows(rawRows: string[][], options: ReviewIctTaskImportOptions): IctTaskImportReview {
	if (rawRows.length === 0) {
		return { validRows: [], invalidRows: [] };
	}

	const hasHeaders = detectHeaderRow(rawRows[0], ICT_TASK_IMPORT_COLUMNS);
	const mappings = autoMapColumns(rawRows[0], ICT_TASK_IMPORT_COLUMNS, hasHeaders);
	const dataRows = hasHeaders ? rawRows.slice(1) : rawRows;
	const rowNumberOffset = hasHeaders ? 2 : 1;
	const mappedRows = dataRows.map((rawRow, index) => ({
		rowNumber: index + rowNumberOffset,
		values: applyMapping(rawRow, mappings)
	}));

	return reviewMappedIctTaskImportRows(mappedRows, options);
}
