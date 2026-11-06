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

const eventSpan = { startsOn: dateOnlySchema, endsOn: dateOnlySchema };
const calendarEvent = lifecycle({
	writer: 'database',
	noun: 'event',
	plural: 'events',
	details: eventSpan,
	fields: { title: 'title', startsOn: 'start', endsOn: 'end', host: 'host', location: 'location' },
	flags: { coordinator: 'coordinator', description: 'description', sourceReference: 'source' },
	suffix: ({ startsOn, endsOn }, context) => ` ${fromTo(startsOn, endsOn, context)}`
});
const calendarTasking = lifecycle({
	writer: 'database',
	noun: 'tasking',
	plural: 'taskings',
	fields: {
		title: 'title',
		suspenseOn: 'suspense',
		executionStartsOn: 'execution start',
		executionEndsOn: 'execution end',
		reportTime: 'report time',
		staffingRequired: 'people required',
		responsible: 'responsible'
	},
	flags: { event: 'event', qualifications: 'qualifications', instructions: 'instructions' }
});

function taskingTransition(verb: string) {
	return auditKind({
		writer: 'database',
		entry: z.object({ record: savedLabel, details: z.object({}) }),
		sentence: ({ record }) => `${verb} tasking ${record}`,
		batch: { verb, one: 'tasking', many: 'taskings' }
	});
}

function taskingItem(verb: string, noun: string) {
	return auditKind({
		writer: 'database',
		entry: z.object({ record: savedLabel, details: z.object({ item: savedLabel }) }),
		sentence: ({ record, details }) => `${verb} ${noun} ${details.item} on ${record}`,
		batch: { verb, one: noun, many: `${noun}s` }
	});
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
	'calendar_event.created': calendarEvent.created,
	'calendar_event.updated': calendarEvent.updated,
	'calendar_event.deleted': calendarEvent.deleted,
	'calendar_event.cancelled': auditKind({
		writer: 'database',
		entry: z.object({ record: savedLabel, details: z.object(eventSpan) }),
		sentence: ({ record, details }, context) =>
			`Cancelled event ${record} ${fromTo(details.startsOn, details.endsOn, context)}`,
		batch: { verb: 'Cancelled', one: 'event', many: 'events' }
	}),
	'calendar_tasking.created': calendarTasking.created,
	'calendar_tasking.updated': calendarTasking.updated,
	'calendar_tasking.deleted': calendarTasking.deleted,
	'calendar_tasking.started': taskingTransition('Started'),
	'calendar_tasking.blocked': taskingTransition('Blocked'),
	'calendar_tasking.unblocked': taskingTransition('Unblocked'),
	'calendar_tasking.completed': taskingTransition('Completed'),
	'calendar_tasking.reopened': taskingTransition('Reopened'),
	'calendar_tasking.cancelled': taskingTransition('Cancelled'),
	'calendar_tasking.detached': auditKind({
		writer: 'database',
		entry: z.object({ record: savedLabel, details: z.object({ event: savedLabel }) }),
		sentence: ({ record, details }) => `Detached tasking ${record} from event ${details.event}`,
		batch: { verb: 'Detached', one: 'tasking from its event', many: 'taskings from their event' }
	}),
	'calendar_tasking.equipment_added': taskingItem('Added', 'equipment'),
	'calendar_tasking.equipment_changed': taskingItem('Changed', 'equipment'),
	'calendar_tasking.equipment_secured': taskingItem('Updated secured count of', 'equipment'),
	'calendar_tasking.equipment_removed': taskingItem('Removed', 'equipment'),
	'calendar_tasking.checklist_added': taskingItem('Added', 'checklist item'),
	'calendar_tasking.checklist_renamed': taskingItem('Renamed', 'checklist item'),
	'calendar_tasking.checklist_completed': taskingItem('Completed', 'checklist item'),
	'calendar_tasking.checklist_reopened': taskingItem('Reopened', 'checklist item'),
	'calendar_tasking.checklist_removed': taskingItem('Removed', 'checklist item'),
	'status_type.created': statusType.created,
	'status_type.updated': statusType.updated,
	'status_type.deleted': statusType.deleted,
	'special_day.created': specialDay.created,
	'special_day.updated': specialDay.updated,
	'special_day.deleted': specialDay.deleted,
	'assignment_type.created': assignmentType.created,
	'assignment_type.updated': assignmentType.updated,
	'assignment_type.deleted': assignmentType.deleted,
	'assignment_type.calendar_lanes_reordered': auditKind({
		writer: 'database',
		entry: z.object({ details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ details }) => `Reordered ${plural(details.count, 'calendar lane', 'calendar lanes')}`,
		batch: { verb: 'Reordered', one: 'calendar lane list', many: 'calendar lane lists' }
	}),
	'status_type.reordered': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ details }) => `Reordered ${plural(details.count, 'status type', 'status types')}`,
		batch: { verb: 'Reordered', one: 'status type list', many: 'status type lists' }
	})
} as const;
