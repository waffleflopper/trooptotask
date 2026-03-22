import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';

export const RatingSchemeEntryEntity = defineEntity<RatingSchemeEntry>({
	table: 'rating_scheme_entries',
	groupScope: { personnelColumn: 'rated_person_id' },
	orderBy: [{ column: 'rating_period_end', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		ratedPersonId: field(z.string(), { column: 'rated_person_id', isPersonnelId: true }),
		evalType: field(z.enum(['OER', 'NCOER', 'WOER']), { column: 'eval_type' }),
		raterPersonId: field(z.string().nullable().optional(), {
			column: 'rater_person_id',
			insertDefault: null
		}),
		raterName: field(z.string().nullable().optional(), {
			column: 'rater_name',
			insertDefault: null
		}),
		seniorRaterPersonId: field(z.string().nullable().optional(), {
			column: 'senior_rater_person_id',
			insertDefault: null
		}),
		seniorRaterName: field(z.string().nullable().optional(), {
			column: 'senior_rater_name',
			insertDefault: null
		}),
		intermediateRaterPersonId: field(z.string().nullable().optional(), {
			column: 'intermediate_rater_person_id',
			insertDefault: null
		}),
		intermediateRaterName: field(z.string().nullable().optional(), {
			column: 'intermediate_rater_name',
			insertDefault: null
		}),
		reviewerPersonId: field(z.string().nullable().optional(), {
			column: 'reviewer_person_id',
			insertDefault: null
		}),
		reviewerName: field(z.string().nullable().optional(), {
			column: 'reviewer_name',
			insertDefault: null
		}),
		ratingPeriodStart: field(z.string(), { column: 'rating_period_start' }),
		ratingPeriodEnd: field(z.string(), { column: 'rating_period_end' }),
		status: field(z.string(), { column: 'status' }),
		notes: field(z.string().nullable().optional(), { insertDefault: null }),
		reportType: field(z.string().nullable().optional(), {
			column: 'report_type',
			insertDefault: null
		}),
		workflowStatus: field(z.string().nullable().optional(), {
			column: 'workflow_status',
			insertDefault: null
		})
	}
});
