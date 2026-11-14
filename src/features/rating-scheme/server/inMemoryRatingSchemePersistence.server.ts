import { fail } from '$lib/errors';
import type { Evaluation, EvaluatorChain, RatingScheme, RatingSchemePersistence } from '../contracts';
import { isEvaluationCompleted, isWorkflowMoveAllowed, workflowRoles } from '../utils/evaluationWorkflow';
import { followedChain, isEvaluationOpen } from '../utils/ratingSchemeEntries';
import { calculateThruDate } from '../utils/ratingScheme';
import { formatDate, parseDate } from '$lib/utils/dates';
import {
	COMPLETED_REPORT_KEPT,
	EVALUATION_GONE,
	EVALUATION_MOVED,
	NEXT_RATER_REFUSED,
	RATER_CHANGE_NEEDS_REPORT,
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

function dayAfter(date: string): string {
	const next = parseDate(date);
	next.setDate(next.getDate() + 1);
	return formatDate(next);
}

/** Only a Change of Rater names a next rater, and it names one at most. */
function requireNextRaterFits(row: Pick<EvaluationRow, 'report_type' | 'next_rater_person_id' | 'next_rater_name'>) {
	const named = Number(row.next_rater_person_id !== null) + Number(row.next_rater_name !== null);
	if (named > (row.report_type === 'CR' ? 1 : 0)) fail(400, NEXT_RATER_REFUSED);
}

/**
 * Holds the database's rules: one listed scheme per person, one open Evaluation per scheme, a signed chain on
 * completion, and a scheme that moves to the next rater when its Change of Rater first completes.
 */
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
			return {
				ratingSchemeId: row.rating_scheme_id,
				ratedPersonId: row.rated_person_id,
				nextRaterPersonId: row.next_rater_person_id
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
			const replacesLinkedRater =
				scheme.raterPersonId !== null &&
				values.rater_person_id !== undefined &&
				values.rater_person_id !== scheme.raterPersonId;
			if (replacesLinkedRater && (await schemeEvaluations(id)).some((row) => isEvaluationOpen(row.workflowStatus))) {
				fail(409, RATER_CHANGE_NEEDS_REPORT);
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
			const nextRaterName = start.nextRaterName?.trim() || null;
			if (start.nextRaterPersonId !== null || nextRaterName !== null) {
				if (start.reportType !== 'CR' || start.completed) {
					fail(400, 'Only an open Change of Rater evaluation names a next rater');
				}
				if (start.nextRaterPersonId !== null && nextRaterName !== null) fail(400, 'Choose one next rater');
			}
			const scheme = await requireScheme(ratingSchemeId);
			if (scheme.archivedAt !== null) fail(409, 'The rating scheme is archived');
			if (start.completed) {
				const recorded = (await schemeEvaluations(ratingSchemeId)).find(
					(row) =>
						isEvaluationCompleted(row.workflowStatus) &&
						row.reportType === start.reportType &&
						row.ratingPeriodStart === start.ratingPeriodStart &&
						row.ratingPeriodEnd === start.ratingPeriodEnd
				);
				if (recorded) return { evaluation: recorded, created: false };
			} else {
				const open = (await schemeEvaluations(ratingSchemeId)).find((row) => isEvaluationOpen(row.workflowStatus));
				if (open) {
					const replay =
						open.reportType === start.reportType &&
						open.ratingPeriodStart === start.ratingPeriodStart &&
						open.ratingPeriodEnd === start.ratingPeriodEnd &&
						open.nextRaterPersonId === start.nextRaterPersonId &&
						open.nextRaterName === nextRaterName;
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
				next_rater_person_id: start.nextRaterPersonId,
				next_rater_name: nextRaterName,
				rater_changed_at: start.completed && start.reportType === 'CR' ? new Date().toISOString() : null,
				...snapshotValues(start.completed ? scheme : null)
			});
			return { evaluation: mapEvaluation(row), created: true };
		},
		async updateEvaluation(id, patch) {
			const row = await store.findOne<EvaluationRow>(EVALUATIONS, orgId, { id });
			if (!row) return null;
			const values = evaluationPatchValues(patch);
			const reportKeys = [
				'report_type',
				'rating_period_start',
				'rating_period_end',
				'next_rater_person_id',
				'next_rater_name'
			] as const;
			if (
				isEvaluationCompleted(mapEvaluation(row).workflowStatus) &&
				reportKeys.some((key) => key in values && values[key] !== row[key])
			) {
				fail(409, COMPLETED_REPORT_KEPT);
			}
			const leavesChangeOfRater = 'report_type' in values && values.report_type !== 'CR' && row.report_type === 'CR';
			const next = { ...values, ...(leavesChangeOfRater && { next_rater_person_id: null, next_rater_name: null }) };
			requireNextRaterFits({ ...row, ...next });
			return mapEvaluation(await store.update<EvaluationRow>(EVALUATIONS, orgId, id, next));
		},
		deleteEvaluation(id) {
			return store.deleteWhere(EVALUATIONS, orgId, { id });
		},
		async transitionEvaluation(id, { from, to }) {
			const evaluation = await requireEvaluation(id);
			if (evaluation.workflowStatus === to) {
				if (!isEvaluationCompleted(to) || evaluation.reportType !== 'CR' || evaluation.raterChangedAt === null) {
					return { evaluation, moved: false, raterChange: null };
				}
				const start = dayAfter(evaluation.ratingPeriodEnd);
				const successor = (await schemeEvaluations(evaluation.ratingSchemeId)).find(
					(row) => row.reportType === 'AN' && row.ratingPeriodStart === start
				);
				return {
					evaluation,
					moved: false,
					raterChange: { ratingScheme: await requireScheme(evaluation.ratingSchemeId), successor: successor ?? null }
				};
			}
			const scheme = await requireScheme(evaluation.ratingSchemeId);
			if (
				evaluation.workflowStatus !== from ||
				!isWorkflowMoveAllowed(from, to, workflowRoles(followedChain(scheme, evaluation)))
			) {
				return fail(409, EVALUATION_MOVED);
			}
			const others = (await schemeEvaluations(scheme.id)).filter((row) => row.id !== id);
			if (
				!isEvaluationOpen(from) &&
				isEvaluationOpen(to) &&
				others.some((row) => isEvaluationOpen(row.workflowStatus))
			) {
				fail(409, OPEN_ELSEWHERE);
			}
			const changesRater =
				isEvaluationCompleted(to) && evaluation.reportType === 'CR' && evaluation.raterChangedAt === null;
			if (
				changesRater &&
				scheme.archivedAt === null &&
				others.some((other) => isEvaluationOpen(other.workflowStatus))
			) {
				fail(409, OPEN_ELSEWHERE);
			}
			// A reopened Change of Rater keeps the chain that signed it, since its scheme has moved to the next rater.
			const signed = isEvaluationCompleted(to)
				? {
						...snapshotValues(evaluation.signedChain ?? scheme),
						...(changesRater && { rater_changed_at: new Date().toISOString() })
					}
				: isEvaluationCompleted(from)
					? { ...(evaluation.raterChangedAt === null && snapshotValues(null)), eval_type: scheme.evalType }
					: {};
			const row = await store.update<EvaluationRow>(EVALUATIONS, orgId, id, { workflow_status: to, ...signed });
			if (!changesRater) return { evaluation: mapEvaluation(row), moved: true, raterChange: null };

			const ratingScheme = mapRatingScheme(
				await store.update<RatingSchemeRow>(SCHEMES, orgId, scheme.id, {
					rater_person_id: evaluation.nextRaterPersonId,
					rater_name: evaluation.nextRaterName
				})
			);
			if (ratingScheme.archivedAt !== null) {
				return { evaluation: mapEvaluation(row), moved: true, raterChange: { ratingScheme, successor: null } };
			}
			const start = dayAfter(evaluation.ratingPeriodEnd);
			const successor = await store.insert<EvaluationRow>(EVALUATIONS, orgId, {
				rating_scheme_id: scheme.id,
				rated_person_id: scheme.ratedPersonId,
				eval_type: scheme.evalType,
				report_type: 'AN',
				rating_period_start: start,
				rating_period_end: calculateThruDate('AN', start),
				workflow_status: 'drafting',
				notes: null,
				next_rater_person_id: null,
				next_rater_name: null,
				rater_changed_at: null,
				...snapshotValues(null)
			});
			return {
				evaluation: mapEvaluation(row),
				moved: true,
				raterChange: { ratingScheme, successor: mapEvaluation(successor) }
			};
		}
	};
}
