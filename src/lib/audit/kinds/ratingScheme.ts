import { z } from 'zod';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import { auditKind, lifecycle, range, savedLabel, type AuditSentenceContext } from './shared';

/** Entries saved before the split carried their period; a rating scheme has none. */
const savedPeriod = { periodStart: dateOnlySchema.optional(), periodEnd: dateOnlySchema.optional() };
const periodSuffix = (
	{ periodStart, periodEnd }: { periodStart?: string; periodEnd?: string },
	context: AuditSentenceContext
) => (periodStart && periodEnd ? `, ${range(periodStart, periodEnd, context)}` : '');

const scheme = lifecycle({
	writer: 'database',
	noun: 'rating scheme',
	plural: 'rating schemes',
	about: true,
	details: savedPeriod,
	fields: {
		evalType: 'type',
		status: 'status',
		workflowStatus: 'workflow',
		reportType: 'report type',
		periodStart: 'period start',
		periodEnd: 'period end'
	},
	flags: { raters: 'raters', notes: 'notes', membership: 'rating scheme listing' },
	suffix: periodSuffix
});

const listing = (verb: 'Archived' | 'Restored') =>
	auditKind({
		writer: 'database',
		entry: z.object({ record: savedLabel, subject: savedLabel, details: z.object(savedPeriod) }),
		sentence: ({ record, subject, details }, context) =>
			`${verb} rating scheme ${record} for ${subject}${periodSuffix(details, context)}`,
		batch: { verb, one: 'rating scheme', many: 'rating schemes' }
	});

const evaluation = lifecycle({
	writer: 'database',
	noun: 'evaluation',
	plural: 'evaluations',
	about: true,
	details: { periodStart: dateOnlySchema, periodEnd: dateOnlySchema },
	fields: {
		evalType: 'type',
		workflowStatus: 'workflow',
		reportType: 'report type',
		periodStart: 'period start',
		periodEnd: 'period end'
	},
	flags: { notes: 'notes' },
	suffix: ({ periodStart, periodEnd }, context) => `, ${range(periodStart, periodEnd, context)}`
});

export const ratingSchemeKinds = {
	'rating_scheme.created': scheme.created,
	'rating_scheme.updated': scheme.updated,
	'rating_scheme.archived': listing('Archived'),
	'rating_scheme.restored': listing('Restored'),
	'rating_scheme.deleted': scheme.deleted,
	'evaluation.created': evaluation.created,
	'evaluation.updated': evaluation.updated,
	'evaluation.deleted': evaluation.deleted
} as const;
