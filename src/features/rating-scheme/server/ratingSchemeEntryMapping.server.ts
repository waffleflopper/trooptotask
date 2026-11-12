import type { Database } from '$lib/server/database';
import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';
import type { RatingSchemeCreateValues, RatingSchemePatchValues, SavedRatingSchemeEntry } from '../contracts';
import { parseWorkflowStatus } from '../utils/evaluationWorkflow';
import { WORKFLOW_STEPS, type WorkflowStatus } from '../rating-scheme.types';

/** archived_by is read through the audit log, never selected. */
export type RatingSchemeRow = Omit<Database['public']['Tables']['rating_scheme_entries']['Row'], 'archived_by'>;

export const RATING_SCHEME_SELECT =
	'id,organization_id,rated_person_id,eval_type,rater_person_id,rater_name,senior_rater_person_id,senior_rater_name,intermediate_rater_person_id,intermediate_rater_name,reviewer_person_id,reviewer_name,rating_period_start,rating_period_end,notes,report_type,workflow_status,archived_at,created_at,updated_at';

const ratingSchemeEntryFields = z.object({
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
	notes: z.string().nullable().optional(),
	reportType: z.string().nullable().optional()
});

/** Only the lifecycle actions move the step or the scheme listing, so a client still sending one learns that instead of losing the change. */
const notAField = (message: string) => z.never({ error: message }).optional();
const workflowNotAField = notAField('The workflow step changes through its own action, not a save');
const archiveNotAField = notAField('Archiving changes through its own action, not a save');

/** A new entry starts not tracked; the client's optimistic row says so. */
export const ratingSchemeEntryCreateSchema = ratingSchemeEntryFields.extend({
	status: workflowNotAField,
	workflowStatus: z.null({ error: 'A new evaluation starts not tracked' }).optional(),
	archivedAt: z.null({ error: 'A new evaluation starts on the rating scheme' }).optional()
});

export const ratingSchemeEntryUpdateSchema = ratingSchemeEntryFields.partial().extend({
	id: uuidSchema,
	status: workflowNotAField,
	workflowStatus: workflowNotAField,
	archivedAt: archiveNotAField
});

const workflowStepSchema = z
	.enum(WORKFLOW_STEPS.map((step) => step.value) as [WorkflowStatus, ...WorkflowStatus[]])
	.nullable();

export const ratingSchemeArchiveSchema = z.strictObject({ archived: z.boolean() });

export const ratingSchemeTransitionSchema = z.strictObject({ from: workflowStepSchema, to: workflowStepSchema });

export const ratingSchemeRaterChangeSchema = z
	.strictObject({
		changeDate: dateOnlySchema,
		raterPersonId: uuidSchema.nullable().optional(),
		raterName: z.string().trim().nullable().optional()
	})
	.transform(({ changeDate, raterPersonId, raterName }) => ({
		changeDate,
		raterPersonId: raterPersonId ?? null,
		raterName: raterName || null
	}))
	.refine((change) => (change.raterPersonId === null) !== (change.raterName === null), 'Choose one new rater');

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
		notes: row.notes,
		reportType: row.report_type as SavedRatingSchemeEntry['reportType'],
		workflowStatus: parseWorkflowStatus(row.workflow_status),
		archivedAt: row.archived_at ?? null,
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
		notes: emptyToNull(input.notes) ?? null,
		report_type: emptyToNull(input.reportType) ?? null
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
		notes: emptyToNull(input.notes),
		report_type: emptyToNull(input.reportType)
	};
	const filtered: Partial<typeof values> = Object.fromEntries(
		Object.entries(values).filter(([, value]) => value !== undefined)
	);
	return filtered;
}
