import { z } from 'zod';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import { auditKind, day, plural, savedLabel } from './shared';

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
const taskingList = z.object({ record: savedLabel, details: z.object({ item: savedLabel.nullable() }) });

function reordered(noun: string) {
	return auditKind({
		writer: 'app',
		entry: taskingList,
		sentence: ({ record }) => `Reordered ${noun} on ${record}`,
		batch: { verb: 'Reordered', one: noun, many: `${noun}s` }
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
	'calendar_tasking.staffed': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ picked: nonNegative, needsReview: nonNegative }) }),
		sentence: ({ record, details }) =>
			`Staffed tasking ${record} with ${plural(details.picked, 'person', 'people')}${
				details.needsReview ? ` (${details.needsReview} to review)` : ''
			}`,
		batch: { verb: 'Staffed', one: 'tasking', many: 'taskings' }
	}),
	'calendar_tasking.equipment_reordered': reordered('equipment'),
	'calendar_tasking.checklist_reordered': reordered('checklist item')
} as const;
