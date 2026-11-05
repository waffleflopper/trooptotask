import { z } from 'zod';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import { auditKind, day, lifecycle, plural, savedLabel } from './shared';

const ictTask = lifecycle({
	writer: 'database',
	noun: 'critical task',
	plural: 'critical tasks',
	details: { taskCode: savedLabel },
	fields: { taskCode: 'code', title: 'title', expirationMonths: 'expires after (months)', category: 'category' },
	flags: { mos: 'MOS', description: 'description' },
	suffix: ({ taskCode }) => ` (${taskCode})`
});

const stateChange = (verb: string) =>
	auditKind({
		writer: 'database',
		entry: z.object({ record: savedLabel, subject: z.string().nullish(), details: z.object({ taskCode: savedLabel }) }),
		sentence: ({ record, details }) => `${verb} critical task ${record} (${details.taskCode})`,
		batch: { verb, one: 'critical task', many: 'critical tasks' }
	});

const completion = lifecycle({
	writer: 'database',
	noun: 'critical task completion',
	plural: 'critical task completions',
	about: true,
	details: { completedAt: dateOnlySchema, validationMethod: savedLabel },
	fields: { completedAt: 'completed', validationMethod: 'validated by' },
	flags: { notes: 'notes' },
	suffix: ({ completedAt }, context) => ` on ${day(completedAt, context)}`
});

export const criticalTaskKinds = {
	'ict_task.created': ictTask.created,
	'ict_task.updated': ictTask.updated,
	'ict_task.archived': stateChange('Archived'),
	'ict_task.restored': stateChange('Restored'),
	'ict_task.deleted': ictTask.deleted,
	'ict_task.reordered': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ details }) => `Reordered ${plural(details.count, 'critical task', 'critical tasks')}`,
		batch: { verb: 'Reordered', one: 'critical task list', many: 'critical task lists' }
	}),
	'personnel_ict_completion.created': completion.created,
	'personnel_ict_completion.updated': completion.updated,
	'personnel_ict_completion.deleted': completion.deleted
} as const;
