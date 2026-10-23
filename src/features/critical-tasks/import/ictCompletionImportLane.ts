import type { Personnel } from '$features/personnel/contracts';
import {
	defineImportLane,
	type ColumnSplitter,
	type FieldDiff,
	type ImportReference,
	type ReferenceOption,
	type RowReview
} from '$lib/components/patterns/import-flow';
import type { IctCompletionImportRecord } from '../contracts';
import {
	ICT_VALIDATION_METHODS,
	type IctTask,
	type IctValidationMethod,
	type PersonnelIctCompletion
} from '../criticalTasks.types';
import { personnelIctCompletionsStore } from '../stores/personnelIctCompletions.svelte';
import { normalizeIctTaskCode } from '../utils/ictTaskLibrary';

export const ictCompletionImportColumns = {
	rank: {
		label: 'Rank',
		kind: 'text',
		aliases: ['rank', 'grade', 'gr', 'pay grade', 'paygrade', 'rnk'],
		example: 'SGT',
		hint: 'Tells apart two people with one name.'
	},
	lastName: {
		label: 'Last name',
		kind: 'text',
		required: true,
		aliases: ['last name', 'lastname', 'last', 'surname', 'family name'],
		example: 'Garcia'
	},
	firstName: {
		label: 'First name',
		kind: 'text',
		required: true,
		aliases: ['first name', 'firstname', 'first', 'given name'],
		example: 'Luis'
	},
	groupName: {
		label: 'Group',
		kind: 'text',
		aliases: ['group', 'unit', 'section', 'team', 'platoon', 'plt', 'squad'],
		example: '1st Platoon',
		hint: 'Tells apart two people with one name.'
	},
	taskCode: {
		label: 'Task code',
		kind: 'text',
		required: true,
		aliases: ['task code', 'task_code', 'critical task code', 'ict task code', 'task number', 'task #', 'task'],
		example: '081-833-0010'
	},
	completedAt: {
		label: 'Completed',
		kind: 'date',
		required: true,
		aliases: [
			'completed',
			'completion date',
			'completed at',
			'completed_at',
			'date completed',
			'date',
			'validation date',
			'validated'
		],
		example: '2026-03-11'
	},
	validationMethod: {
		label: 'Validation method',
		kind: 'text',
		aliases: ['validation method', 'validation_method', 'method'],
		example: 'Demonstration',
		hint: 'Blank saves new completions as Other.'
	},
	validatedBy: {
		label: 'Validator',
		kind: 'text',
		aliases: ['validator', 'validated by', 'validated_by', 'grader', 'evaluator'],
		example: 'SFC Lee',
		maxLength: 200
	},
	notes: {
		label: 'Notes',
		kind: 'text',
		aliases: ['notes', 'note', 'comments', 'comment', 'remarks'],
		maxLength: 2000
	}
} as const;

export type IctCompletionImportColumns = typeof ictCompletionImportColumns;
const columns = ictCompletionImportColumns;

export interface IctCompletionImportSource {
	orgUrlSegment: string;
	person: ImportReference<IctCompletionImportColumns, Personnel> & { required: true; whenMissing: 'ask' };
	nameSplitter: ColumnSplitter<IctCompletionImportColumns>;
	tasks: readonly IctTask[];
	completions: readonly PersonnelIctCompletion[];
}

const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

function taskReference(
	tasks: readonly IctTask[]
): ImportReference<IctCompletionImportColumns, IctTask> & { required: true; whenMissing: 'ask' } {
	const option = (task: IctTask): ReferenceOption<IctTask> => ({
		id: task.id,
		label: task.taskCode,
		hint: task.title,
		value: task
	});
	const byCode = new Map(tasks.map((task) => [normalizeIctTaskCode(task.taskCode), task]));
	const active = tasks.filter((task) => !task.archivedAt);
	const byCompact = new Map(active.map((task) => [compact(task.taskCode), task]));
	return {
		label: 'task',
		reads: ['taskCode'],
		required: true,
		whenMissing: 'ask',
		options: active.map(option),
		key(raw) {
			const code = normalizeIctTaskCode(raw.taskCode ?? '');
			if (!code) return null;
			return { key: code, display: byCode.get(code)?.archivedAt ? `${code} (archived)` : code };
		},
		find(key) {
			const task = byCode.get(key);
			if (task && !task.archivedAt) return { kind: 'one', option: option(task) };
			const near = byCompact.get(compact(key));
			return near ? { kind: 'none', suggestion: option(near) } : { kind: 'none' };
		}
	};
}

function methodReference(): ImportReference<IctCompletionImportColumns, IctValidationMethod> {
	const options = ICT_VALIDATION_METHODS.map((method) => ({ id: method, label: method, value: method }));
	const key = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
	const byKey = new Map(options.map((option) => [key(option.label), option]));
	return {
		label: 'validation method',
		reads: ['validationMethod'],
		whenMissing: 'ask',
		options,
		key(raw) {
			const display = raw.validationMethod?.trim();
			return display ? { key: key(display), display } : null;
		},
		find(wanted) {
			const exact = byKey.get(wanted);
			if (exact) return { kind: 'one', option: exact };
			const near = wanted ? options.filter((option) => key(option.label).startsWith(wanted)) : [];
			return near.length === 1 ? { kind: 'none', suggestion: near[0] } : { kind: 'none' };
		}
	};
}

const completionKey = (personnelId: string, ictTaskId: string, completedAt: string) =>
	`${personnelId}|${ictTaskId}|${completedAt}`;

export function createIctCompletionImportLane(source: IctCompletionImportSource) {
	const saved = new Map(
		source.completions.map((completion) => [
			completionKey(completion.personnelId, completion.ictTaskId, completion.completedAt),
			completion
		])
	);
	return defineImportLane({
		id: 'critical-task-completions',
		noun: { one: 'completion', other: 'completions' },
		intro: {
			title: 'One row per completion',
			body: 'Each row names a person, a task code and the date it was completed. A completion already saved for that person, task and date is updated instead of added. Blank cells never clear a saved value.'
		},
		identity: {
			fields: ['lastName', 'firstName'],
			label: (raw) => [raw.lastName, raw.firstName].filter(Boolean).join(', ')
		},
		columns,
		splitters: [source.nameSplitter],
		references: { person: source.person, task: taskReference(source.tasks), method: methodReference() },
		review({ values, refs }): RowReview<IctCompletionImportRecord> {
			const person = refs.person.value;
			const task = refs.task.value;
			const key = completionKey(person.id, task.id, values.completedAt);
			const record: IctCompletionImportRecord = {
				personnelId: person.id,
				ictTaskId: task.id,
				completedAt: values.completedAt,
				...(refs.method ? { validationMethod: refs.method.value } : {}),
				...(values.validatedBy !== null ? { validatedBy: values.validatedBy } : {}),
				...(values.notes !== null ? { notes: values.notes } : {})
			};
			const existing = saved.get(key);
			if (!existing) return { outcome: 'new', key, change: record };
			const diff: FieldDiff[] = [];
			const compare = (label: string, before: string | null, after: string | undefined) => {
				if (after !== undefined && after !== (before ?? '')) diff.push({ label, before: before ?? '', after });
			};
			compare(columns.validationMethod.label, existing.validationMethod, record.validationMethod);
			compare(columns.validatedBy.label, existing.validatedBy, record.validatedBy);
			compare(columns.notes.label, existing.notes, record.notes);
			return diff.length ? { outcome: 'update', key, change: record, diff } : { outcome: 'unchanged', key };
		},
		commitChunk: (records) => personnelIctCompletionsStore.importChunk([...records]),
		savedIn: 'Critical Tasks',
		exit: { href: `/org/${source.orgUrlSegment}/critical-tasks`, label: 'Open Critical Tasks' }
	});
}
