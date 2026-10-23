import { defineImportLane, type FieldDiff, type RowReview } from '$lib/components/patterns/import-flow';
import { ICT_MOS_CODE, type IctTaskImportRecord } from '../contracts';
import { ICT_TASK_SORT_ORDER_MAX, type IctTask } from '../criticalTasks.types';
import { requestCriticalTasksWorkspaceRefresh } from '../criticalTasksWorkspaceStatus.svelte';
import { ictTasksStore } from '../stores/ictTasks.svelte';
import { normalizeIctTaskCode, parseMosApplicabilityInput } from '../utils/ictTaskLibrary';

export const ictTaskImportColumns = {
	taskCode: {
		label: 'Task code',
		kind: 'text',
		required: true,
		aliases: ['task code', 'task_code', 'task number', 'task_number', 'task #', 'task', 'code'],
		example: '081-833-0010',
		maxLength: 64
	},
	title: {
		label: 'Title',
		kind: 'text',
		aliases: ['title', 'task title', 'task_title', 'task name', 'name'],
		example: 'Open an airway',
		hint: 'Needed for new tasks.',
		maxLength: 200
	},
	description: {
		label: 'Description',
		kind: 'text',
		aliases: ['description', 'desc', 'task description', 'task_description'],
		maxLength: 2000
	},
	category: {
		label: 'Category',
		kind: 'text',
		aliases: ['category', 'task category', 'task_category', 'domain', 'task domain', 'task_domain'],
		example: 'Airway',
		maxLength: 120
	},
	mos: {
		label: 'MOS',
		kind: 'text',
		aliases: ['mos', "mos's", 'mos applicability', 'mos_applicability', 'applicability', 'applies to mos'],
		example: '68W, 18D',
		hint: 'Separate codes with commas.'
	},
	expirationMonths: {
		label: 'Expires after (months)',
		kind: 'integer',
		aliases: ['expiration months', 'expiration_months', 'expiration', 'expires', 'expires months', 'months'],
		example: '12'
	},
	sortOrder: {
		label: 'Sort order',
		kind: 'integer',
		aliases: ['sort order', 'sort_order', 'order', 'sequence'],
		example: '10'
	}
} as const;

const columns = ictTaskImportColumns;

export interface IctTaskImportSource {
	orgUrlSegment: string;
	tasks: readonly IctTask[];
}

const sameMos = (left: readonly string[], right: readonly string[]) =>
	[...left].sort().join(',') === [...right].sort().join(',');

export function createIctTaskImportLane(source: IctTaskImportSource) {
	const byCode = new Map(source.tasks.map((task) => [normalizeIctTaskCode(task.taskCode), task]));
	return defineImportLane({
		id: 'critical-task-library',
		noun: { one: 'task', other: 'tasks' },
		intro: {
			title: 'Tasks match by task code',
			body: 'A code already in the library updates that task, and an archived one comes back to the active library. Every other code is added. Blank cells never clear a saved value.'
		},
		identity: { fields: ['taskCode'], label: (raw) => raw.taskCode ?? '' },
		columns,
		references: {},
		review({ values }): RowReview<IctTaskImportRecord> {
			const taskCode = normalizeIctTaskCode(values.taskCode);
			const mos = values.mos === null ? null : parseMosApplicabilityInput(values.mos);
			const badMos = mos?.find((code) => !ICT_MOS_CODE.test(code));
			if (badMos)
				return {
					outcome: 'fix',
					problems: [{ field: 'mos', message: `${badMos} is not an MOS code. Use 2 to 6 letters or digits.` }]
				};
			if (values.expirationMonths !== null && values.expirationMonths < 1)
				return {
					outcome: 'fix',
					problems: [{ field: 'expirationMonths', message: 'Use a whole number of months above 0.' }]
				};
			if (values.sortOrder !== null && (values.sortOrder < 0 || values.sortOrder > ICT_TASK_SORT_ORDER_MAX))
				return { outcome: 'fix', problems: [{ field: 'sortOrder', message: 'Use 0 or a larger whole number.' }] };
			const record: IctTaskImportRecord = {
				taskCode,
				...(values.title !== null ? { title: values.title } : {}),
				...(values.description !== null ? { description: values.description } : {}),
				...(values.category !== null ? { category: values.category } : {}),
				...(mos?.length ? { mos } : {}),
				...(values.expirationMonths !== null ? { expirationMonths: values.expirationMonths } : {}),
				...(values.sortOrder !== null ? { sortOrder: values.sortOrder } : {})
			};
			const saved = byCode.get(taskCode);
			if (!saved) {
				if (!record.title)
					return { outcome: 'fix', problems: [{ field: 'title', message: 'A new task needs a title.' }] };
				return { outcome: 'new', key: taskCode, change: record };
			}
			const diff: FieldDiff[] = [];
			const compare = (label: string, before: string, after: string | undefined) => {
				if (after !== undefined && after !== before) diff.push({ label, before, after });
			};
			if (saved.archivedAt) diff.push({ label: 'Status', before: 'Archived', after: 'Active' });
			compare(columns.title.label, saved.title, record.title);
			compare(columns.description.label, saved.description ?? '', record.description);
			compare(columns.category.label, saved.category ?? '', record.category);
			if (record.mos && !sameMos(saved.mos, record.mos))
				diff.push({ label: columns.mos.label, before: saved.mos.join(', '), after: record.mos.join(', ') });
			compare(
				columns.expirationMonths.label,
				String(saved.expirationMonths ?? ''),
				record.expirationMonths?.toString()
			);
			compare(columns.sortOrder.label, String(saved.sortOrder), record.sortOrder?.toString());
			if (!diff.length) return { outcome: 'unchanged', key: taskCode };
			return { outcome: 'update', key: taskCode, change: record, diff };
		},
		commitChunk(records) {
			if (records.some((record) => byCode.get(record.taskCode)?.archivedAt)) requestCriticalTasksWorkspaceRefresh();
			return ictTasksStore.importChunk([...records]);
		},
		savedIn: 'the task library',
		exit: { href: `/org/${source.orgUrlSegment}/critical-tasks/library`, label: 'Open the task library' }
	});
}
