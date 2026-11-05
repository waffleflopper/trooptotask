import { z } from 'zod';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import { auditKind, day, plural, range, savedLabel, type AuditSentenceContext } from './shared';

const nonNegative = z.number().int().min(0);

const assignee = z
	.object({
		record: savedLabel,
		subject: savedLabel.nullish(),
		details: z.object({ date: dateOnlySchema, group: savedLabel.nullable() })
	})
	.refine(({ subject, details }) => Boolean(subject) || details.group !== null);
const who = ({ subject, details }: z.infer<typeof assignee>) => subject ?? details.group;

const slot = z.object({ record: savedLabel, details: z.object({ date: dateOnlySchema }) });
const swap = z.object({
	record: savedLabel,
	details: z.object({ dates: z.array(dateOnlySchema).min(1) })
});
const dates = (list: string[], context: AuditSentenceContext) => list.map((date) => day(date, context)).join(' and ');

const eventEntry = z.object({ record: savedLabel, details: z.object({}) });
const taskingEntry = z.object({ record: savedLabel, details: z.object({}) });
const taskingItem = z.object({ record: savedLabel, details: z.object({ item: savedLabel.nullable() }) });

function taskingEvent(verb: string) {
	return auditKind({
		writer: 'app',
		entry: taskingEntry,
		sentence: ({ record }) => `${verb} tasking ${record}`,
		batch: { verb, one: 'tasking', many: 'taskings' }
	});
}

function itemEvent(verb: string, noun: string) {
	return auditKind({
		writer: 'app',
		entry: taskingItem,
		sentence: ({ record, details }) => `${verb} ${noun}${details.item ? ` ${details.item}` : ''} on ${record}`,
		batch: { verb, one: noun, many: `${noun}s` }
	});
}

function eventKind(verb: string, tail = '') {
	return auditKind({
		writer: 'app',
		entry: eventEntry,
		sentence: ({ record }) => `${verb} event ${record}${tail}`,
		batch: { verb, one: 'event', many: 'events' }
	});
}

export const calendarAppKinds = {
	'calendar_report.viewed': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({}) }),
		sentence: () => 'Viewed a calendar report',
		batch: { verb: 'Viewed', one: 'calendar report', many: 'calendar reports' }
	}),
	'daily_assignment.created': auditKind({
		writer: 'app',
		entry: assignee,
		sentence: (entry, context) => `Assigned ${who(entry)} to ${entry.record} on ${day(entry.details.date, context)}`,
		batch: { verb: 'Assigned', one: 'daily assignment', many: 'daily assignments' }
	}),
	'daily_assignment.updated': auditKind({
		writer: 'app',
		entry: assignee,
		sentence: (entry, context) => `Changed ${entry.record} on ${day(entry.details.date, context)} to ${who(entry)}`,
		batch: { verb: 'Changed', one: 'daily assignment', many: 'daily assignments' }
	}),
	'daily_assignment.cleared': auditKind({
		writer: 'app',
		entry: slot,
		sentence: ({ record, details }, context) => `Cleared ${record} on ${day(details.date, context)}`,
		batch: { verb: 'Cleared', one: 'daily assignment', many: 'daily assignments' }
	}),
	'daily_assignment.roster_filled': auditKind({
		writer: 'app',
		entry: z.object({
			record: savedLabel,
			details: z.object({ from: dateOnlySchema, through: dateOnlySchema, days: nonNegative })
		}),
		sentence: ({ record, details }, context) =>
			`Filled the ${record} roster for ${range(details.from, details.through, context)} (${plural(details.days, 'day', 'days')})`,
		batch: { verb: 'Filled', one: 'roster', many: 'rosters' }
	}),
	'daily_assignment.roster_replaced': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ date: dateOnlySchema, repicks: nonNegative }) }),
		sentence: ({ record, details }, context) =>
			`Replaced the ${record} pick on ${day(details.date, context)} and re-picked ${plural(details.repicks, 'later day', 'later days')}`,
		batch: { verb: 'Replaced a pick on', one: 'roster', many: 'rosters' }
	}),
	'daily_assignment.roster_swapped': auditKind({
		writer: 'app',
		entry: swap,
		sentence: ({ record, details }, context) => `Swapped ${record} duty between ${dates(details.dates, context)}`,
		batch: { verb: 'Swapped duty on', one: 'roster', many: 'rosters' }
	}),
	'daily_assignment.roster_swap_undone': auditKind({
		writer: 'app',
		entry: swap,
		sentence: ({ record, details }, context) =>
			`Undid the ${record} duty swap between ${dates(details.dates, context)}`,
		batch: { verb: 'Undid a duty swap on', one: 'roster', many: 'rosters' }
	}),
	'assignment_type.roster_excusals_set': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ excused: nonNegative }) }),
		sentence: ({ record, details }) =>
			`Set the ${record} roster excusals (${plural(details.excused, 'person', 'people')} excused)`,
		batch: { verb: 'Set excusals on', one: 'roster', many: 'rosters' }
	}),
	'assignment_type.roster_form_closed': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ ended: z.boolean() }) }),
		sentence: ({ record, details }) =>
			details.ended ? `Ended the ${record} roster` : `Changed the ${record} roster rules and opened a new DA 6 form`,
		batch: { verb: 'Changed rules on', one: 'roster', many: 'rosters' }
	}),
	'assignment_type.roster_starting_numbers_set': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ people: nonNegative, repicked: nonNegative }) }),
		sentence: ({ record, details }) =>
			`Set starting numbers for ${plural(details.people, 'person', 'people')} on the ${record} roster and re-picked ${plural(details.repicked, 'day', 'days')}`,
		batch: { verb: 'Set starting numbers on', one: 'roster', many: 'rosters' }
	}),
	'calendar_event.created': eventKind('Created'),
	'calendar_event.updated': eventKind('Changed'),
	'calendar_event.cancelled': eventKind('Cancelled'),
	'calendar_event.deleted': auditKind({
		writer: 'app',
		entry: z.object({
			record: savedLabel,
			details: z.object({ taskings: z.enum(['standalone', 'delete']), count: nonNegative })
		}),
		sentence: ({ record, details }) =>
			`Deleted event ${record}${
				details.count === 0
					? ''
					: details.taskings === 'delete'
						? ` and ${plural(details.count, 'tasking', 'taskings')}`
						: `, keeping ${plural(details.count, 'tasking', 'taskings')}`
			}`,
		batch: { verb: 'Deleted', one: 'event', many: 'events' }
	}),
	'calendar_tasking.created': taskingEvent('Created'),
	'calendar_tasking.updated': taskingEvent('Changed'),
	'calendar_tasking.started': taskingEvent('Started'),
	'calendar_tasking.blocked': taskingEvent('Blocked'),
	'calendar_tasking.unblocked': taskingEvent('Unblocked'),
	'calendar_tasking.completed': taskingEvent('Completed'),
	'calendar_tasking.reopened': taskingEvent('Reopened'),
	'calendar_tasking.cancelled': taskingEvent('Cancelled'),
	'calendar_tasking.staffed': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ picked: nonNegative, needsReview: nonNegative }) }),
		sentence: ({ record, details }) =>
			`Staffed tasking ${record} with ${plural(details.picked, 'person', 'people')}${
				details.needsReview ? ` (${details.needsReview} to review)` : ''
			}`,
		batch: { verb: 'Staffed', one: 'tasking', many: 'taskings' }
	}),
	'calendar_tasking.equipment_added': itemEvent('Added', 'equipment'),
	'calendar_tasking.equipment_changed': itemEvent('Changed', 'equipment'),
	'calendar_tasking.equipment_secured': itemEvent('Updated secured count of', 'equipment'),
	'calendar_tasking.equipment_removed': itemEvent('Removed', 'equipment'),
	'calendar_tasking.equipment_reordered': itemEvent('Reordered', 'equipment'),
	'calendar_tasking.checklist_added': itemEvent('Added', 'checklist item'),
	'calendar_tasking.checklist_renamed': itemEvent('Renamed', 'checklist item'),
	'calendar_tasking.checklist_completed': itemEvent('Completed', 'checklist item'),
	'calendar_tasking.checklist_reopened': itemEvent('Reopened', 'checklist item'),
	'calendar_tasking.checklist_removed': itemEvent('Removed', 'checklist item'),
	'calendar_tasking.checklist_reordered': itemEvent('Reordered', 'checklist item')
} as const;
