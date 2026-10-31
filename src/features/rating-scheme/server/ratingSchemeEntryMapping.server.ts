import type { Database } from '$lib/server/database';
import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';
import type { RatingSchemeCreateValues, RatingSchemePatchValues, SavedRatingSchemeEntry } from '../contracts';

export type RatingSchemeRow = Database['public']['Tables']['rating_scheme_entries']['Row'];

export const RATING_SCHEME_SELECT =
	'id,organization_id,rated_person_id,eval_type,rater_person_id,rater_name,senior_rater_person_id,senior_rater_name,intermediate_rater_person_id,intermediate_rater_name,reviewer_person_id,reviewer_name,rating_period_start,rating_period_end,status,notes,report_type,workflow_status,created_at,updated_at';

export const ratingSchemeEntryCreateSchema = z.object({
	ratedPersonId: uuidSchema,
	evalType: z.enum(['OER', 'NCOER', 'WOER']),
	raterPersonId: z.string().nullable().optional(),
	raterName: z.string().nullable().optional(),
	seniorRaterPersonId: z.string().nullable().optional(),
	seniorRaterName: z.string().nullable().optional(),
	intermediateRaterPersonId: z.string().nullable().optional(),
	intermediateRaterName: z.string().nullable().optional(),
	reviewerPersonId: z.string().nullable().optional(),
	reviewerName: z.string().nullable().optional(),
	ratingPeriodStart: dateOnlySchema,
	ratingPeriodEnd: dateOnlySchema,
	status: z.enum(['active', 'completed', 'change-of-rater']),
	notes: z.string().nullable().optional(),
	reportType: z.string().nullable().optional(),
	workflowStatus: z.string().nullable().optional()
});

export const ratingSchemeEntryUpdateSchema = ratingSchemeEntryCreateSchema.partial().extend({ id: uuidSchema });

export function mapRatingSchemeEntry(row: RatingSchemeRow): SavedRatingSchemeEntry {
	return {
		id: row.id,
		organization_id: row.organization_id,
		ratedPersonId: row.rated_person_id,
		evalType: row.eval_type as SavedRatingSchemeEntry['evalType'],
		raterPersonId: row.rater_person_id,
		raterName: row.rater_name,
		seniorRaterPersonId: row.senior_rater_person_id,
		seniorRaterName: row.senior_rater_name,
		intermediateRaterPersonId: row.intermediate_rater_person_id,
		intermediateRaterName: row.intermediate_rater_name,
		reviewerPersonId: row.reviewer_person_id,
		reviewerName: row.reviewer_name,
		ratingPeriodStart: row.rating_period_start,
		ratingPeriodEnd: row.rating_period_end,
		status: row.status as SavedRatingSchemeEntry['status'],
		notes: row.notes,
		reportType: row.report_type as SavedRatingSchemeEntry['reportType'],
		workflowStatus: row.workflow_status as SavedRatingSchemeEntry['workflowStatus'],
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

function emptyToNull(value: string | null | undefined) {
	return value === '' ? null : value;
}

export function ratingSchemeCreateValues(input: RatingSchemeCreateValues) {
	return {
		rated_person_id: input.ratedPersonId,
		eval_type: input.evalType,
		rater_person_id: emptyToNull(input.raterPersonId) ?? null,
		rater_name: emptyToNull(input.raterName) ?? null,
		senior_rater_person_id: emptyToNull(input.seniorRaterPersonId) ?? null,
		senior_rater_name: emptyToNull(input.seniorRaterName) ?? null,
		intermediate_rater_person_id: emptyToNull(input.intermediateRaterPersonId) ?? null,
		intermediate_rater_name: emptyToNull(input.intermediateRaterName) ?? null,
		reviewer_person_id: emptyToNull(input.reviewerPersonId) ?? null,
		reviewer_name: emptyToNull(input.reviewerName) ?? null,
		rating_period_start: input.ratingPeriodStart,
		rating_period_end: input.ratingPeriodEnd,
		status: input.status,
		notes: emptyToNull(input.notes) ?? null,
		report_type: emptyToNull(input.reportType) ?? null,
		workflow_status: emptyToNull(input.workflowStatus) ?? null
	};
}

export function ratingSchemePatchValues(input: RatingSchemePatchValues) {
	const values = {
		rated_person_id: input.ratedPersonId,
		eval_type: input.evalType,
		rater_person_id: emptyToNull(input.raterPersonId),
		rater_name: emptyToNull(input.raterName),
		senior_rater_person_id: emptyToNull(input.seniorRaterPersonId),
		senior_rater_name: emptyToNull(input.seniorRaterName),
		intermediate_rater_person_id: emptyToNull(input.intermediateRaterPersonId),
		intermediate_rater_name: emptyToNull(input.intermediateRaterName),
		reviewer_person_id: emptyToNull(input.reviewerPersonId),
		reviewer_name: emptyToNull(input.reviewerName),
		rating_period_start: input.ratingPeriodStart,
		rating_period_end: input.ratingPeriodEnd,
		status: input.status,
		notes: emptyToNull(input.notes),
		report_type: emptyToNull(input.reportType),
		workflow_status: emptyToNull(input.workflowStatus)
	};
	const filtered: Partial<typeof values> = Object.fromEntries(
		Object.entries(values).filter(([, value]) => value !== undefined)
	);
	return filtered;
}
