export const trainingImportColumns = {
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
	training: {
		label: 'Training',
		kind: 'text',
		required: true,
		aliases: ['training', 'training type', 'type', 'course', 'certification', 'training name'],
		example: 'CPR/BLS',
		hint: 'Or one column per training, named like your training types.'
	},
	completed: {
		label: 'Completed',
		kind: 'text',
		required: true,
		aliases: [
			'completed',
			'date',
			'completion date',
			'date completed',
			'completed on',
			'date / status',
			'date/status',
			'status'
		],
		example: '2026-03-11',
		hint: 'A date. X or yes asks you for a date. Exempt or N/A marks exempt.'
	},
	note: {
		label: 'Notes',
		kind: 'text',
		aliases: ['notes', 'note', 'comments', 'comment', 'remarks'],
		example: 'Annual refresher',
		hint: 'Saved with each completion on the row.'
	}
} as const;
