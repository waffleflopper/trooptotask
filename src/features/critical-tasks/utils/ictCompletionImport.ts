import type {
	IctTask,
	IctValidationMethod,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import { ICT_VALIDATION_METHODS } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { applyMapping, autoMapColumns, detectHeaderRow, type ColumnDef } from '$lib/utils/columnMapping';
import { parseDateString } from '$lib/utils/csvParser';

export type IctCompletionImportPayload = Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>;

export interface IctCompletionImportMappedRow {
	rowNumber: number;
	values: Record<string, string>;
}

export interface IctCompletionImportMatch {
	personnelId: string;
	displayName: string;
}

export interface IctCompletionImportValidRow {
	rowNumber: number;
	completionId: string | null;
	personnelId: string;
	ictTaskId: string;
	personnel: Personnel;
	task: IctTask;
	completion: IctCompletionImportPayload;
}

export interface IctCompletionImportProblemRow {
	rowNumber: number;
	values: Record<string, string>;
	errors: string[];
	matches?: IctCompletionImportMatch[];
}

export interface IctCompletionImportReview {
	validRows: IctCompletionImportValidRow[];
	invalidRows: IctCompletionImportProblemRow[];
	ambiguousRows: IctCompletionImportProblemRow[];
}

export interface ReviewIctCompletionImportOptions {
	personnel: Personnel[];
	tasks: IctTask[];
	existingCompletions: PersonnelIctCompletion[];
}

export const ICT_COMPLETION_IMPORT_COLUMNS: ColumnDef[] = [
	{
		key: 'rank',
		label: 'Rank',
		required: false,
		aliases: ['rank', 'grade', 'pay grade', 'paygrade']
	},
	{
		key: 'lastName',
		label: 'Last Name',
		required: true,
		aliases: ['last name', 'lastname', 'last', 'surname', 'family name']
	},
	{
		key: 'firstName',
		label: 'First Name',
		required: true,
		aliases: ['first name', 'firstname', 'first', 'given name']
	},
	{
		key: 'taskCode',
		label: 'Task Code',
		required: true,
		aliases: ['task code', 'task_code', 'critical task code', 'critical_task_code', 'ict task code', 'task']
	},
	{
		key: 'completedAt',
		label: 'Completion Date',
		required: true,
		aliases: [
			'completion date',
			'completed at',
			'completed_at',
			'date completed',
			'date',
			'validation date',
			'validation_date'
		]
	},
	{
		key: 'validationMethod',
		label: 'Validation Method',
		required: false,
		aliases: ['validation method', 'validation_method', 'method']
	},
	{
		key: 'validatedBy',
		label: 'Validator',
		required: false,
		aliases: ['validator', 'validated by', 'validated_by', 'grader', 'evaluator']
	},
	{
		key: 'notes',
		label: 'Notes',
		required: false,
		aliases: ['notes', 'note', 'comments', 'remarks']
	}
];

function normalize(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeTaskCode(value: string): string {
	return value.trim().toUpperCase();
}

function displayName(person: Personnel): string {
	return [person.rank.trim(), person.firstName.trim(), person.lastName.trim()].filter(Boolean).join(' ');
}

function matchValidationMethod(value: string): { value: IctValidationMethod | null; error: string | null } {
	const trimmed = value.trim();
	if (!trimmed) {
		return { value: 'Other', error: null };
	}

	const match = ICT_VALIDATION_METHODS.find((method) => normalize(method) === normalize(trimmed));
	if (!match) {
		return {
			value: null,
			error: 'Validation method must match one of the supported ICT validation methods'
		};
	}

	return { value: match, error: null };
}

function findTask(tasks: IctTask[], taskCode: string): IctTask | undefined {
	const normalizedTaskCode = normalizeTaskCode(taskCode);
	return tasks.find((task) => normalizeTaskCode(task.taskCode) === normalizedTaskCode);
}

function findExistingCompletion(
	existingCompletions: PersonnelIctCompletion[],
	personnelId: string,
	ictTaskId: string,
	completedAt: string
): PersonnelIctCompletion | undefined {
	return existingCompletions
		.filter(
			(completion) =>
				completion.personnelId === personnelId &&
				completion.ictTaskId === ictTaskId &&
				completion.completedAt === completedAt
		)
		.sort((a, b) => {
			if (a.completedAt === b.completedAt) {
				return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
			}
			return b.completedAt.localeCompare(a.completedAt);
		})[0];
}

function findPersonnelMatches(personnel: Personnel[], values: Record<string, string>): Personnel[] {
	const firstName = normalize(values.firstName ?? '');
	const lastName = normalize(values.lastName ?? '');
	const rank = normalize(values.rank ?? '');

	return personnel.filter((person) => {
		if (normalize(person.firstName) !== firstName) return false;
		if (normalize(person.lastName) !== lastName) return false;
		if (rank && normalize(person.rank) !== rank) return false;
		return true;
	});
}

export function reviewMappedIctCompletionImportRows(
	rows: IctCompletionImportMappedRow[],
	options: ReviewIctCompletionImportOptions
): IctCompletionImportReview {
	if (rows.length === 0) {
		return {
			validRows: [],
			invalidRows: [],
			ambiguousRows: []
		};
	}

	const validRows: IctCompletionImportValidRow[] = [];
	const invalidRows: IctCompletionImportProblemRow[] = [];
	const ambiguousRows: IctCompletionImportProblemRow[] = [];

	for (const row of rows) {
		const values = row.values;
		const firstName = (values.firstName ?? '').trim();
		const lastName = (values.lastName ?? '').trim();
		const taskCode = normalizeTaskCode(values.taskCode ?? '');
		const completedAt = parseDateString(values.completedAt ?? '');
		const validationMethod = matchValidationMethod(values.validationMethod ?? '');
		const task = taskCode ? findTask(options.tasks, taskCode) : undefined;

		const errors = [
			!lastName ? 'Last name is required' : '',
			!firstName ? 'First name is required' : '',
			!taskCode ? 'Task code is required' : '',
			taskCode && !task ? `Task code "${taskCode}" does not match an existing critical task` : '',
			!completedAt ? 'Completion date must be a valid date' : '',
			validationMethod.error ?? ''
		].filter(Boolean);

		if (errors.length > 0) {
			invalidRows.push({
				rowNumber: row.rowNumber,
				values,
				errors
			});
			continue;
		}

		const personnelMatches = findPersonnelMatches(options.personnel, values);
		if (personnelMatches.length === 0) {
			invalidRows.push({
				rowNumber: row.rowNumber,
				values,
				errors: ['Personnel record not found. Check the rank, first name, and last name values.']
			});
			continue;
		}

		if (personnelMatches.length > 1) {
			ambiguousRows.push({
				rowNumber: row.rowNumber,
				values,
				errors: ['Multiple personnel records match this row. Add rank or correct the name values.'],
				matches: personnelMatches
					.map((person) => ({
						personnelId: person.id,
						displayName: displayName(person)
					}))
					.sort((left, right) => left.displayName.localeCompare(right.displayName))
			});
			continue;
		}

		const person = personnelMatches[0];
		const existingCompletion = findExistingCompletion(options.existingCompletions, person.id, task!.id, completedAt!);

		validRows.push({
			rowNumber: row.rowNumber,
			completionId: existingCompletion?.id ?? null,
			personnelId: person.id,
			ictTaskId: task!.id,
			personnel: person,
			task: task!,
			completion: {
				personnelId: person.id,
				ictTaskId: task!.id,
				completedAt: completedAt!,
				validationMethod: validationMethod.value!,
				validatedBy: (values.validatedBy ?? '').trim() || null,
				notes: (values.notes ?? '').trim() || null
			}
		});
	}

	return {
		validRows,
		invalidRows,
		ambiguousRows
	};
}

export function reviewIctCompletionImportRows(
	rawRows: string[][],
	options: ReviewIctCompletionImportOptions
): IctCompletionImportReview {
	if (rawRows.length === 0) {
		return {
			validRows: [],
			invalidRows: [],
			ambiguousRows: []
		};
	}

	const hasHeaders = detectHeaderRow(rawRows[0], ICT_COMPLETION_IMPORT_COLUMNS);
	const mappings = autoMapColumns(rawRows[0], ICT_COMPLETION_IMPORT_COLUMNS, hasHeaders);
	const dataRows = hasHeaders ? rawRows.slice(1) : rawRows;
	const rowNumberOffset = hasHeaders ? 2 : 1;
	const mappedRows = dataRows.map((rawRow, index) => ({
		rowNumber: index + rowNumberOffset,
		values: applyMapping(rawRow, mappings)
	}));

	return reviewMappedIctCompletionImportRows(mappedRows, options);
}
