import type {
	Evaluation,
	EvaluatorChain,
	RatingScheme,
	RatingSchemeEntry,
	WorkflowStatus
} from '../rating-scheme.types';

export const EVALUATOR_CHAIN_KEYS = [
	'raterPersonId',
	'raterName',
	'seniorRaterPersonId',
	'seniorRaterName',
	'intermediateRaterPersonId',
	'intermediateRaterName',
	'reviewerPersonId',
	'reviewerName'
] as const satisfies readonly (keyof EvaluatorChain)[];

export function evaluatorChain(source: EvaluatorChain): EvaluatorChain {
	return {
		raterPersonId: source.raterPersonId ?? null,
		raterName: source.raterName ?? null,
		seniorRaterPersonId: source.seniorRaterPersonId ?? null,
		seniorRaterName: source.seniorRaterName ?? null,
		intermediateRaterPersonId: source.intermediateRaterPersonId ?? null,
		intermediateRaterName: source.intermediateRaterName ?? null,
		reviewerPersonId: source.reviewerPersonId ?? null,
		reviewerName: source.reviewerName ?? null
	};
}

/** Open means tracked and not yet completed; a rating scheme has at most one open Evaluation. */
export function isEvaluationOpen(workflowStatus: WorkflowStatus | null): boolean {
	return workflowStatus !== null && workflowStatus !== 'completed';
}

/** An Evaluation stays on the tracker while its scheme is listed, and while it is open after the scheme is archived. */
export function isOnTracker(entry: Pick<RatingSchemeEntry, 'archivedAt' | 'workflowStatus'>): boolean {
	return entry.archivedAt === null || isEvaluationOpen(entry.workflowStatus);
}

/** The Evaluation as the Evals page lists it: the chain and type it was signed on, else its scheme's current ones. */
export function toRatingSchemeEntry(scheme: RatingScheme, evaluation: Evaluation): RatingSchemeEntry {
	return {
		id: evaluation.id,
		ratingSchemeId: scheme.id,
		ratedPersonId: evaluation.ratedPersonId,
		evalType: evaluation.workflowStatus === 'completed' ? evaluation.evalType : scheme.evalType,
		...evaluatorChain(evaluation.signedChain ?? scheme),
		ratingPeriodStart: evaluation.ratingPeriodStart,
		ratingPeriodEnd: evaluation.ratingPeriodEnd,
		notes: evaluation.notes,
		reportType: evaluation.reportType,
		workflowStatus: evaluation.workflowStatus,
		archivedAt: scheme.archivedAt,
		chainSigned: evaluation.signedChain !== null
	};
}

/** Every Evaluation whose scheme is loaded, in the Evaluations' order. */
export function toRatingSchemeEntries(
	schemes: readonly RatingScheme[],
	evaluations: readonly Evaluation[]
): RatingSchemeEntry[] {
	const byId = new Map(schemes.map((scheme) => [scheme.id, scheme]));
	return evaluations.flatMap((evaluation) => {
		const scheme = byId.get(evaluation.ratingSchemeId);
		return scheme ? [toRatingSchemeEntry(scheme, evaluation)] : [];
	});
}
