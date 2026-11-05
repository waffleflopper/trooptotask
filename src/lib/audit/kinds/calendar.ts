import { z } from 'zod';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import {
	auditKind,
	dateChange,
	day,
	fromTo,
	labelChange,
	lifecycle,
	plural,
	range,
	savedLabel,
	type AuditSentenceContext
} from './shared';

const span = { startDate: dateOnlySchema, endDate: dateOnlySchema };

const availabilityEntry = z.object({ record: savedLabel, subject: savedLabel, details: z.object(span) });
const availabilityChange = z.object({
	record: savedLabel,
	subject: savedLabel,
	details: z.object({
		...span,
		change: z
			.object({
				person: labelChange.optional(),
				status: labelChange.optional(),
				startDate: dateChange.optional(),
				endDate: dateChange.optional(),
				note: z.object({ withheld: z.literal(true) }).optional()
			})
			.refine((change) => Object.values(change).some(Boolean))
	})
});
const availabilityNoun = { one: 'availability entry', many: 'availability entries' };

function availabilityUpdated(
	{ record, subject, details }: z.infer<typeof availabilityChange>,
	context: AuditSentenceContext
): string {
	const { change, startDate, endDate } = details;
	const status = change.status ? `${change.status.from ?? 'an entry'} to ${record}` : record;
	const person = change.person?.from ? `${subject} (moved from ${change.person.from})` : subject;
	const now = range(startDate, endDate, context);
	if (!change.status && !change.person && !change.startDate && !change.endDate) {
		return `Changed the note on ${record} for ${subject} on ${now}`;
	}
	const dates =
		change.startDate || change.endDate
			? ` from ${range(change.startDate?.from ?? startDate, change.endDate?.from ?? endDate, context)} to ${now}`
			: ` on ${now}`;
	return `Changed ${status} for ${person}${dates}${change.note ? ', and its note' : ''}`;
}

const statusType = lifecycle({
	writer: 'database',
	noun: 'status type',
	plural: 'status types',
	fields: {
		name: 'name',
		shortLabel: 'short label',
		color: 'color',
		textColor: 'text color',
		rosterEffect: 'roster effect'
	}
});
const specialDay = lifecycle({
	writer: 'database',
	noun: 'Special Day',
	plural: 'Special Days',
	details: { date: dateOnlySchema },
	fields: { name: 'name', date: 'date' },
	suffix: ({ date }, context) => ` on ${day(date, context)}`
});
const assignmentType = lifecycle({
	writer: 'database',
	noun: 'assignment type',
	plural: 'assignment types',
	details: { assignTo: z.enum(['personnel', 'group']) },
	fields: {
		name: 'name',
		shortName: 'short name',
		assignTo: 'assigned to',
		color: 'color',
		showOnCalendar: 'shown on the calendar'
	}
});

export const calendarKinds = {
	'availability.created': auditKind({
		writer: 'database',
		entry: availabilityEntry,
		sentence: ({ record, subject, details }, context) =>
			`Added ${record} for ${subject} ${fromTo(details.startDate, details.endDate, context)}`,
		batch: { verb: 'Added', ...availabilityNoun }
	}),
	'availability.updated': auditKind({
		writer: 'database',
		entry: availabilityChange,
		sentence: availabilityUpdated,
		batch: { verb: 'Changed', ...availabilityNoun }
	}),
	'availability.deleted': auditKind({
		writer: 'database',
		entry: availabilityEntry,
		sentence: ({ record, subject, details }, context) =>
			`Deleted ${record} for ${subject} ${fromTo(details.startDate, details.endDate, context)}`,
		batch: { verb: 'Deleted', ...availabilityNoun }
	}),
	'status_type.created': statusType.created,
	'status_type.updated': statusType.updated,
	'status_type.deleted': statusType.deleted,
	'special_day.created': specialDay.created,
	'special_day.updated': specialDay.updated,
	'special_day.deleted': specialDay.deleted,
	'assignment_type.created': assignmentType.created,
	'assignment_type.updated': assignmentType.updated,
	'assignment_type.deleted': assignmentType.deleted,
	'status_type.reordered': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ details }) => `Reordered ${plural(details.count, 'status type', 'status types')}`,
		batch: { verb: 'Reordered', one: 'status type list', many: 'status type lists' }
	}),
	'special_day.federal_holidays_reset': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ details }) => `Reset the federal holidays to ${plural(details.count, 'default', 'defaults')}`,
		batch: { verb: 'Reset', one: 'set of federal holidays', many: 'sets of federal holidays' }
	})
} as const;
