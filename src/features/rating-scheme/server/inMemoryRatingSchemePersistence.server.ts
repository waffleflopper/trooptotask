import { fail } from '$lib/errors';
import type { Evaluation, EvaluatorChain, RatingScheme, RatingSchemePersistence } from '../contracts';
import { isEvaluationCompleted, isWorkflowMoveAllowed, workflowRoles } from '../utils/evaluationWorkflow';
import { isEvaluationOpen } from '../utils/ratingSchemeEntries';
import { calculateThruDate } from '../utils/ratingScheme';
import { formatDate, parseDate } from '$lib/utils/dates';
import {
	COMPLETED_REPORT_KEPT,
	EVALUATION_GONE,
	EVALUATION_MOVED,
	RATING_SCHEME_GONE,
	RATING_SCHEME_TAKEN
} from './ratingSchemeLifecycleFailure.server';
import {
	evaluationPatchValues,
	mapEvaluation,
	mapRatingScheme,
	ratingSchemeCreateValues,
	ratingSchemePatchValues,
	type EvaluationRow,
	type RatingSchemeRow
} from './ratingSchemeEntryMapping.server';

interface RatingSchemeMemoryStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: { orderBy?: Array<{ column: string; ascending: boolean }> }
	): Promise<T[]>;
	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: { select?: string; limit?: number; count?: 'exact' }
	): Promise<{ data: T[]; count: number | null }>;
	insert<T>(table: string, orgId: string, input: Record<string, unknown>): Promise<T>;
	update<T>(table: string, orgId: string, id: string, patch: Record<string, unknown>): Promise<T>;
	deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;
}

const SCHEMES = 'rating_schemes';
const EVALUATIONS = 'evaluations';
const OPEN_ELSEWHERE = 'Another evaluation is already open on this rating scheme';

function snapshotValues(chain: EvaluatorChain | null) {
	return {
		chain_snapshot_at: chain ? new Date().toISOString() : null,
		snapshot_rater_person_id: chain?.raterPersonId ?? null,
		snapshot_rater_name: chain?.raterName ?? null,
		snapshot_senior_rater_person_id: chain?.seniorRaterPersonId ?? null,
		snapshot_senior_rater_name: chain?.seniorRaterName ?? null,
		snapshot_intermediate_rater_person_id: chain?.intermediateRaterPersonId ?? null,
		snapshot_intermediate_rater_name: chain?.intermediateRaterName ?? null,
		snapshot_reviewer_person_id: chain?.reviewerPersonId ?? null,
		snapshot_reviewer_name: chain?.reviewerName ?? null
	};
}

function sameRater(scheme: RatingScheme, raterPersonId: string | null, raterName: string | null): boolean {
	if (raterPersonId !== null) return raterPersonId === scheme.raterPersonId;
	return scheme.raterPersonId === null && raterName?.trim().toLowerCase() === scheme.raterName?.trim().toLowerCase();
}

/** Holds the database's rules: one listed scheme per person, one open Evaluation per scheme, a signed chain on completion. */
export function createInMemoryRatingSchemePersistence(
	store: RatingSchemeMemoryStore,
	orgId: string
): RatingSchemePersistence {
	async function findScheme(id: string): Promise<RatingScheme | null> {
		const row = await store.findOne<RatingSchemeRow>(SCHEMES, orgId, { id });
		return row ? mapRatingScheme(row) : null;
	}

	async function requireScheme(id: string): Promise<RatingScheme> {
		return (await findScheme(id)) ?? fail(404, RATING_SCHEME_GONE);
	}

	async function requireEvaluation(id: string): Promise<Evaluation> {
		const row = await store.findOne<EvaluationRow>(EVALUATIONS, orgId, { id });
		return row ? mapEvaluation(row) : fail(404, EVALUATION_GONE);
	}

	async function schemeEvaluations(ratingSchemeId: string): Promise<Evaluation[]> {
		return (await store.findMany<EvaluationRow>(EVALUATIONS, orgId, { rating_scheme_id: ratingSchemeId })).map(
			mapEvaluation
		);
	}

	async function requireNoOtherListed(ratedPersonId: string, exceptId?: string): Promise<void> {
		const listed = (await store.findMany<RatingSchemeRow>(SCHEMES, orgId, { rated_person_id: ratedPersonId })).some(
			(row) => row.archived_at === null && row.id !== exceptId
		);
		if (listed) fail(409, RATING_SCHEME_TAKEN);
	}

	async function listSchemes(filters?: Record<string, unknown>) {
		return (
			await store.findMany<RatingSchemeRow>(SCHEMES, orgId, filters, {
				orderBy: [{ column: 'id', ascending: true }]
			})
		).map(mapRatingScheme);
	}

	async function listEvaluations(filters?: Record<string, unknown>, ascending = true) {
		return (
			await store.findMany<EvaluationRow>(EVALUATIONS, orgId, filters, {
				orderBy: [
					{ column: 'rating_period_end', ascending },
					{ column: 'id', ascending }
				]
			})
		).map(mapEvaluation);
	}

	return {
		listRatingSchemes: () => listSchemes(),
		listEvaluations: () => listEvaluations(),
		findRatingScheme: findScheme,
		async findEvaluationReference(id) {
			const row = await store.findOne<EvaluationRow>(EVALUATIONS, orgId, { id });
			if (!row) return null;
			const scheme = await findScheme(row.rating_scheme_id);
			return {
				ratingSchemeId: row.rating_scheme_id,
				ratedPersonId: row.rated_person_id,
				raterPersonId: scheme?.raterPersonId ?? null
			};
		},
		async listPersonReadiness(personnelId) {
			const [ratingSchemes, evaluations] = await Promise.all([
				listSchemes({ rated_person_id: personnelId }),
				listEvaluations({ rated_person_id: personnelId }, false)
			]);
			return { ratingSchemes, evaluations };
		},
		async countRatingSchemes() {
			const result = await store.findManyWithCount(SCHEMES, orgId, undefined, {
				select: 'id',
				limit: 0,
				count: 'exact'
			});
			return result.count ?? 0;
		},
		async createRatingScheme(input) {
			await requireNoOtherListed(input.ratedPersonId);
			return mapRatingScheme(
				await store.insert<RatingSchemeRow>(SCHEMES, orgId, { ...ratingSchemeCreateValues(input), archived_at: null })
			);
		},
		async updateRatingScheme(id, patch) {
			const scheme = await findScheme(id);
			if (!scheme) return null;
			const values = ratingSchemePatchValues(patch);
			const raterChanges =
				(values.rater_person_id !== undefined && values.rater_person_id !== scheme.raterPersonId) ||
				(values.rater_name !== undefined && values.rater_name !== scheme.raterName);
			if (raterChanges && (await schemeEvaluations(id)).some((row) => isEvaluationOpen(row.workflowStatus))) {
				fail(409, 'Change the rater of an open evaluation with Change rater');
			}
			if (values.rated_person_id !== undefined && values.rated_person_id !== scheme.ratedPersonId) {
				if (scheme.archivedAt === null) await requireNoOtherListed(values.rated_person_id, id);
				for (const evaluation of await schemeEvaluations(id)) {
					await store.update(EVALUATIONS, orgId, evaluation.id, { rated_person_id: values.rated_person_id });
				}
			}
			const updated = mapRatingScheme(await store.update<RatingSchemeRow>(SCHEMES, orgId, id, values));
			if (values.eval_type !== undefined) {
				for (const evaluation of await schemeEvaluations(id)) {
					if (isEvaluationCompleted(evaluation.workflowStatus)) continue;
					await store.update(EVALUATIONS, orgId, evaluation.id, { eval_type: values.eval_type });
				}
			}
			return updated;
		},
		async setRatingSchemeArchived(id, archived) {
			const scheme = await requireScheme(id);
			if ((scheme.archivedAt !== null) === archived) return { ratingScheme: scheme, changed: false };
			if (!archived) await requireNoOtherListed(scheme.ratedPersonId, id);
			const row = await store.update<RatingSchemeRow>(SCHEMES, orgId, id, {
				archived_at: archived ? new Date().toISOString() : null
			});
			return { ratingScheme: mapRatingScheme(row), changed: true };
		},
		async startEvaluation(ratingSchemeId, start) {
			if (start.ratingPeriodEnd < start.ratingPeriodStart) {
				fail(400, 'Choose a rating period that ends on or after it starts');
			}
			const scheme = await requireScheme(ratingSchemeId);
			if (scheme.archivedAt !== null) fail(409, 'The rating scheme is archived');
			if (!start.completed) {
				const open = (await schemeEvaluations(ratingSchemeId)).find((row) => isEvaluationOpen(row.workflowStatus));
				if (open) {
					const replay =
						open.reportType === start.reportType &&
						open.ratingPeriodStart === start.ratingPeriodStart &&
						open.ratingPeriodEnd === start.ratingPeriodEnd;
					return replay ? { evaluation: open, created: false } : fail(409, OPEN_ELSEWHERE);
				}
			}
			const row = await store.insert<EvaluationRow>(EVALUATIONS, orgId, {
				rating_scheme_id: scheme.id,
				rated_person_id: scheme.ratedPersonId,
				eval_type: scheme.evalType,
				report_type: start.reportType,
				rating_period_start: start.ratingPeriodStart,
				rating_period_end: start.ratingPeriodEnd,
				workflow_status: start.completed ? 'completed' : 'drafting',
				notes: start.notes,
				...snapshotValues(start.completed ? scheme : null)
			});
			return { evaluation: mapEvaluation(row), created: true };
		},
		async updateEvaluation(id, patch) {
			const row = await store.findOne<EvaluationRow>(EVALUATIONS, orgId, { id });
			if (!row) return null;
			const values = evaluationPatchValues(patch);
			const reportKeys = ['report_type', 'rating_period_start', 'rating_period_end'] as const;
			if (
				isEvaluationCompleted(mapEvaluation(row).workflowStatus) &&
				reportKeys.some((key) => key in values && values[key] !== row[key])
			) {
				fail(409, COMPLETED_REPORT_KEPT);
			}
			return mapEvaluation(await store.update<EvaluationRow>(EVALUATIONS, orgId, id, values));
		},
		deleteEvaluation(id) {
			return store.deleteWhere(EVALUATIONS, orgId, { id });
		},
		async transitionEvaluation(id, { from, to }) {
			const evaluation = await requireEvaluation(id);
			if (evaluation.workflowStatus === to) return { evaluation, moved: false };
			const scheme = await requireScheme(evaluation.ratingSchemeId);
			const chain = evaluation.signedChain ?? scheme;
			if (evaluation.workflowStatus !== from || !isWorkflowMoveAllowed(from, to, workflowRoles(chain))) {
				return fail(409, EVALUATION_MOVED);
			}
			if (!isEvaluationOpen(from) && isEvaluationOpen(to)) {
				const others = await schemeEvaluations(scheme.id);
				if (others.some((row) => row.id !== id && isEvaluationOpen(row.workflowStatus))) fail(409, OPEN_ELSEWHERE);
			}
			const signed = isEvaluationCompleted(to)
				? snapshotValues(evaluation.signedChain ?? scheme)
				: isEvaluationCompleted(from)
					? { ...snapshotValues(null), eval_type: scheme.evalType }
					: {};
			const row = await store.update<EvaluationRow>(EVALUATIONS, orgId, id, { workflow_status: to, ...signed });
			return { evaluation: mapEvaluation(row), moved: true };
		},
		async changeEvaluationRater(id, change) {
			const evaluation = await requireEvaluation(id);
			const scheme = await requireScheme(evaluation.ratingSchemeId);
			const next = parseDate(change.changeDate);
			next.setDate(next.getDate() + 1);
			const start = formatDate(next);
			const same = sameRater(scheme, change.raterPersonId, change.raterName);
			if (isEvaluationCompleted(evaluation.workflowStatus)) {
				const replay = evaluation.reportType === 'CR' && evaluation.ratingPeriodEnd === change.changeDate && same;
				const successor = replay
					? (await schemeEvaluations(scheme.id)).find((row) => row.ratingPeriodStart === start)
					: undefined;
				return { evaluation, ratingScheme: scheme, successor: successor ?? null };
			}
			if (scheme.archivedAt !== null) return fail(409, 'The rating scheme is archived');
			if (same) return fail(400, "The new rater is already this evaluation's rater");
			if (change.changeDate < evaluation.ratingPeriodStart || change.changeDate > evaluation.ratingPeriodEnd) {
				return fail(400, 'The last day with the current rater must fall within the rating period');
			}
			const closed = await store.update<EvaluationRow>(EVALUATIONS, orgId, id, {
				rating_period_end: change.changeDate,
				report_type: 'CR',
				workflow_status: 'completed',
				...snapshotValues(evaluation.signedChain ?? scheme)
			});
			const renamed = await store.update<RatingSchemeRow>(SCHEMES, orgId, scheme.id, {
				rater_person_id: change.raterPersonId,
				rater_name: change.raterName?.trim() || null
			});
			const successor = await store.insert<EvaluationRow>(EVALUATIONS, orgId, {
				rating_scheme_id: scheme.id,
				rated_person_id: scheme.ratedPersonId,
				eval_type: scheme.evalType,
				report_type: 'AN',
				rating_period_start: start,
				rating_period_end: calculateThruDate('AN', start),
				workflow_status: 'drafting',
				notes: null,
				...snapshotValues(null)
			});
			return {
				evaluation: mapEvaluation(closed),
				ratingScheme: mapRatingScheme(renamed),
				successor: mapEvaluation(successor)
			};
		}
	};
}
