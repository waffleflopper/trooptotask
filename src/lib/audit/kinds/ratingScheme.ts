import { z } from 'zod';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import { auditKind, lifecycle, range, savedLabel } from './shared';

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
	flags: { raters: 'raters', notes: 'notes', membership: 'rating scheme listing' },
	suffix: ({ periodStart, periodEnd }, context) => `, ${range(periodStart, periodEnd, context)}`
});

const listing = (verb: 'Archived' | 'Restored') =>
	auditKind({
		writer: 'database',
		entry: z.object({
			record: savedLabel,
			subject: savedLabel,
			details: z.object({ periodStart: dateOnlySchema, periodEnd: dateOnlySchema })
		}),
		sentence: ({ record, subject, details }, context) =>
			`${verb} rating scheme entry ${record} for ${subject}, ${range(details.periodStart, details.periodEnd, context)}`,
		batch: { verb, one: 'rating scheme entry', many: 'rating scheme entries' }
	});

export const ratingSchemeKinds = {
	'rating_scheme.created': entry.created,
	'rating_scheme.updated': entry.updated,
	'rating_scheme.archived': listing('Archived'),
	'rating_scheme.restored': listing('Restored'),
	'rating_scheme.deleted': entry.deleted
} as const;
