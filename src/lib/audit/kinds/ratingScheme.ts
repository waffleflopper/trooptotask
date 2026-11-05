import { dateOnlySchema } from '$lib/utils/inputSchemas';
import { lifecycle, range } from './shared';

const entry = lifecycle({
	writer: 'database',
	noun: 'rating scheme entry',
	plural: 'rating scheme entries',
	about: true,
	details: { periodStart: dateOnlySchema, periodEnd: dateOnlySchema },
	fields: {
		evalType: 'type',
		status: 'status',
		workflowStatus: 'workflow',
		reportType: 'report type',
		periodStart: 'period start',
		periodEnd: 'period end'
	},
	flags: { raters: 'raters', notes: 'notes' },
	suffix: ({ periodStart, periodEnd }, context) => `, ${range(periodStart, periodEnd, context)}`
});

export const ratingSchemeKinds = {
	'rating_scheme.created': entry.created,
	'rating_scheme.updated': entry.updated,
	'rating_scheme.deleted': entry.deleted
} as const;
