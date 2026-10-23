import { AVAILABILITY_NOTE_MAX_LENGTH } from '../contracts';

export const statusImportColumns = {
	rank: {
		label: 'Rank',
		kind: 'text',
		aliases: ['rank', 'grade', 'pay grade', 'paygrade', 'rnk'],
		example: 'SGT',
		hint: 'Tells apart two people with the same name.'
	},
	lastName: {
		label: 'Last name',
		kind: 'text',
		required: true,
		aliases: ['last name', 'lastname', 'last', 'surname', 'family name', 'lname'],
		example: 'Garcia'
	},
	firstName: {
		label: 'First name',
		kind: 'text',
		required: true,
		aliases: ['first name', 'firstname', 'first', 'given name', 'fname'],
		example: 'Luis'
	},
	status: {
		label: 'Status',
		kind: 'text',
		required: true,
		aliases: ['status', 'status type', 'type', 'reason', 'event', 'category'],
		example: 'Leave',
		hint: 'Matched to your status types by name.'
	},
	startDate: {
		label: 'From',
		kind: 'date',
		required: true,
		aliases: ['from', 'start date', 'start', 'begin', 'begins', 'start dt', 'from date'],
		example: '2026-11-03'
	},
	endDate: {
		label: 'To',
		kind: 'date',
		required: true,
		aliases: ['to', 'end date', 'end', 'through', 'thru', 'ends', 'end dt', 'to date', 'return'],
		example: '2026-11-09'
	},
	note: {
		label: 'Note',
		kind: 'text',
		maxLength: AVAILABILITY_NOTE_MAX_LENGTH,
		aliases: ['note', 'notes', 'comment', 'comments', 'remarks', 'description'],
		example: 'Block leave'
	}
} as const;
