import { buildRequestError } from '$lib/stores/core';
import type {
	Evaluation,
	EvaluationPatchValues,
	EvaluationStart,
	EvaluationStartResult,
	EvaluationTransition,
	RatingScheme,
	RatingSchemeArchiveResult,
	RatingSchemeCreateValues,
	RatingSchemeEntryEditorData,
	RatingSchemeMove,
	RatingSchemePatchValues,
	RatingSchemeRaterChange,
	RatingSchemeRaterChangeResult
} from './contracts';
import { planRatingSchemeEntrySave, type RatingSchemeEntrySaveData } from './utils/ratingSchemeEntryDraft';
import { toRatingSchemeEntry } from './utils/ratingSchemeEntries';

async function send<T>(orgId: string, method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(`/org/${orgId}/api/${path}`, {
		method,
		...(body === undefined
			? { cache: 'no-store' as const }
			: { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
	});
	if (!response.ok) throw await buildRequestError(response, method, path.split(/[/?]/)[0]);
	return response.json();
}

export function loadRatingSchemeEntryEditor(orgId: string, evaluationId: string): Promise<RatingSchemeEntryEditorData> {
	return send(orgId, 'GET', `rating-scheme?${new URLSearchParams({ evaluation: evaluationId })}`);
}

export function createRatingScheme(orgId: string, values: RatingSchemeCreateValues): Promise<RatingScheme> {
	return send(orgId, 'POST', 'rating-scheme', values);
}

export function saveRatingScheme(orgId: string, id: string, patch: RatingSchemePatchValues): Promise<RatingScheme> {
	return send(orgId, 'PUT', 'rating-scheme', { id, ...patch });
}

export function saveEvaluation(orgId: string, id: string, patch: EvaluationPatchValues): Promise<Evaluation> {
	return send(orgId, 'PUT', 'evaluations', { id, ...patch });
}

export function startEvaluation(
	orgId: string,
	ratingSchemeId: string,
	start: EvaluationStart
): Promise<EvaluationStartResult> {
	return send(orgId, 'POST', `rating-scheme/${ratingSchemeId}/evaluations`, start);
}

export function archiveRatingScheme(
	orgId: string,
	ratingSchemeId: string,
	archived: boolean
): Promise<RatingSchemeArchiveResult> {
	return send(orgId, 'POST', `rating-scheme/${ratingSchemeId}/archive`, { archived });
}

export function moveEvaluation(orgId: string, id: string, move: RatingSchemeMove): Promise<EvaluationTransition> {
	return send(orgId, 'POST', `evaluations/${id}/workflow`, move);
}

export function changeEvaluationRater(
	orgId: string,
	id: string,
	change: RatingSchemeRaterChange
): Promise<RatingSchemeRaterChangeResult> {
	return send(orgId, 'POST', `evaluations/${id}/change-rater`, change);
}

/** Saves an edited Evaluation row: the chain and type on its scheme unless a chain signed it, then its own fields. */
export async function saveRatingSchemeEntry(
	orgId: string,
	current: Pick<RatingSchemeEntryEditorData, 'ratingScheme' | 'evaluation'>,
	data: RatingSchemeEntrySaveData,
	isCurrent: () => boolean
): Promise<Pick<RatingSchemeEntryEditorData, 'ratingScheme' | 'evaluation'> | undefined> {
	const plan = planRatingSchemeEntrySave(toRatingSchemeEntry(current.ratingScheme, current.evaluation), data);
	const ratingScheme = plan.scheme
		? await saveRatingScheme(orgId, current.ratingScheme.id, plan.scheme)
		: current.ratingScheme;
	if (!isCurrent()) return undefined;
	const evaluation = await saveEvaluation(orgId, current.evaluation.id, plan.evaluation);
	return { ratingScheme, evaluation };
}
