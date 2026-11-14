import type { Database } from '$lib/server/database';
import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';
import type {
	Evaluation,
	EvaluationPatchValues,
	RatingScheme,
	RatingSchemeCreateValues,
	RatingSchemePatchValues
} from '../contracts';
import { parseWorkflowStatus } from '../utils/evaluationWorkflow';
import { WORKFLOW_STEPS, type WorkflowStatus } from '../rating-scheme.types';

type Tables = Database['public']['Tables'];

/** archived_by is stamped by the database and never part of the scheme a client sees. */
export type RatingSchemeRow = Pick<
	Tables['rating_schemes']['Row'],
	| 'id'
	| 'rated_person_id'
	| 'eval_type'
	| 'rater_person_id'
	| 'rater_name'
	| 'senior_rater_person_id'
	| 'senior_rater_name'
	| 'intermediate_rater_person_id'
	| 'intermediate_rater_name'
	| 'reviewer_person_id'
	| 'reviewer_name'
	| 'notes'
	| 'archived_at'
>;

export type EvaluationRow = Pick<
	Tables['evaluations']['Row'],
	| 'id'
	| 'rating_scheme_id'
	| 'rated_person_id'
	| 'eval_type'
	| 'report_type'
	| 'rating_period_start'
	| 'rating_period_end'
	| 'workflow_status'
	| 'notes'
	| 'chain_snapshot_at'
	| 'snapshot_rater_person_id'
	| 'snapshot_rater_name'
	| 'snapshot_senior_rater_person_id'
	| 'snapshot_senior_rater_name'
	| 'snapshot_intermediate_rater_person_id'
	| 'snapshot_intermediate_rater_name'
	| 'snapshot_reviewer_person_id'
	| 'snapshot_reviewer_name'
>;

export const RATING_SCHEME_SELECT =
	'id,rated_person_id,eval_type,rater_person_id,rater_name,senior_rater_person_id,senior_rater_name,intermediate_rater_person_id,intermediate_rater_name,reviewer_person_id,reviewer_name,notes,archived_at';

export const EVALUATION_SELECT =
	'id,rating_scheme_id,rated_person_id,eval_type,report_type,rating_period_start,rating_period_end,workflow_status,notes,chain_snapshot_at,snapshot_rater_person_id,snapshot_rater_name,snapshot_senior_rater_person_id,snapshot_senior_rater_name,snapshot_intermediate_rater_person_id,snapshot_intermediate_rater_name,snapshot_reviewer_person_id,snapshot_reviewer_name';

const evalTypeSchema = z.enum(['OER', 'NCOER', 'WOER']);
const optionalText = z.string().nullable().optional();

const ratingSchemeFields = z.object({
	ratedPersonId: uuidSchema,
	evalType: evalTypeSchema,
	raterPersonId: optionalText,
	raterName: optionalText,
	seniorRaterPersonId: optionalText,
	seniorRaterName: optionalText,
	intermediateRaterPersonId: optionalText,
	intermediateRaterName: optionalText,
	reviewerPersonId: optionalText,
	reviewerName: optionalText,
	notes: optionalText
});

/** Only the lifecycle actions move the step or the scheme listing, so a client still sending one learns that instead of losing the change. */
const notAField = (message: string) => z.never({ error: message }).optional();
const workflowNotAField = notAField('The workflow step changes through its own action, not a save');
const archiveNotAField = notAField('Archiving changes through its own action, not a save');

export const ratingSchemeCreateSchema = ratingSchemeFields.extend({
	archivedAt: z.null({ error: 'A new rating scheme starts listed' }).optional()
});

export const ratingSchemeUpdateSchema = ratingSchemeFields.partial().extend({
	id: uuidSchema,
	archivedAt: archiveNotAField
});

const reportTypeSchema = z.string().trim().nullable().optional();

export const evaluationStartSchema = z
	.strictObject({
		reportType: reportTypeSchema,
		ratingPeriodStart: dateOnlySchema,
		ratingPeriodEnd: dateOnlySchema,
		completed: z.boolean().optional(),
		notes: z.string().trim().nullable().optional()
	})
	.transform(({ reportType, ratingPeriodStart, ratingPeriodEnd, completed, notes }) => ({
		reportType: (reportType || null) as Evaluation['reportType'],
		ratingPeriodStart,
		ratingPeriodEnd,
		completed: completed ?? false,
		notes: notes || null
	}));

export const evaluationUpdateSchema = z.object({
	id: uuidSchema,
	evalType: notAField('An evaluation takes its type from its rating scheme'),
	reportType: reportTypeSchema,
	ratingPeriodStart: dateOnlySchema.optional(),
	ratingPeriodEnd: dateOnlySchema.optional(),
	notes: optionalText,
	status: workflowNotAField,
	workflowStatus: workflowNotAField,
	ratingSchemeId: notAField('An evaluation stays on its rating scheme'),
	signedChain: notAField('The chain that signed an evaluation is kept when it completes')
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

export function mapRatingScheme(row: RatingSchemeRow): RatingScheme {
	return {
		id: row.id,
		ratedPersonId: row.rated_person_id,
		evalType: row.eval_type as RatingScheme['evalType'],
		raterPersonId: row.rater_person_id,
		raterName: row.rater_name,
		seniorRaterPersonId: row.senior_rater_person_id,
		seniorRaterName: row.senior_rater_name,
		intermediateRaterPersonId: row.intermediate_rater_person_id,
		intermediateRaterName: row.intermediate_rater_name,
		reviewerPersonId: row.reviewer_person_id,
		reviewerName: row.reviewer_name,
		notes: row.notes,
		archivedAt: row.archived_at ?? null
	};
}

export function mapEvaluation(row: EvaluationRow): Evaluation {
	return {
		id: row.id,
		ratingSchemeId: row.rating_scheme_id,
		ratedPersonId: row.rated_person_id,
		evalType: row.eval_type as Evaluation['evalType'],
		reportType: row.report_type as Evaluation['reportType'],
		ratingPeriodStart: row.rating_period_start,
		ratingPeriodEnd: row.rating_period_end,
		workflowStatus: parseWorkflowStatus(row.workflow_status),
		notes: row.notes,
		signedChain: row.chain_snapshot_at
			? {
					signedAt: row.chain_snapshot_at,
					raterPersonId: row.snapshot_rater_person_id,
					raterName: row.snapshot_rater_name,
					seniorRaterPersonId: row.snapshot_senior_rater_person_id,
					seniorRaterName: row.snapshot_senior_rater_name,
					intermediateRaterPersonId: row.snapshot_intermediate_rater_person_id,
					intermediateRaterName: row.snapshot_intermediate_rater_name,
					reviewerPersonId: row.snapshot_reviewer_person_id,
					reviewerName: row.snapshot_reviewer_name
				}
			: null
	};
}

function emptyToNull(value: string | null | undefined) {
	return value === '' ? null : value;
}

function definedOnly<T extends Record<string, unknown>>(values: T): Partial<T> {
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export function ratingSchemePatchValues(input: RatingSchemePatchValues) {
	return definedOnly({
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
		notes: emptyToNull(input.notes)
	});
}

export function ratingSchemeCreateValues(input: RatingSchemeCreateValues) {
	return {
		rater_person_id: null,
		rater_name: null,
		senior_rater_person_id: null,
		senior_rater_name: null,
		intermediate_rater_person_id: null,
		intermediate_rater_name: null,
		reviewer_person_id: null,
		reviewer_name: null,
		notes: null,
		...ratingSchemePatchValues(input),
		rated_person_id: input.ratedPersonId,
		eval_type: input.evalType
	};
}

export function evaluationPatchValues(input: EvaluationPatchValues) {
	return definedOnly({
		report_type: emptyToNull(input.reportType),
		rating_period_start: input.ratingPeriodStart,
		rating_period_end: input.ratingPeriodEnd,
		notes: emptyToNull(input.notes)
	});
}
