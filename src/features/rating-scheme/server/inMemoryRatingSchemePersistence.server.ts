import { fail } from '$lib/errors';
import type { RatingSchemePersistence } from '../contracts';
import { isEvaluationCompleted, isWorkflowMoveAllowed, workflowRoles } from '../utils/evaluationWorkflow';
import { calculateThruDate } from '../utils/ratingScheme';
import { formatDate, parseDate } from '$lib/utils/dates';
import { EVALUATION_GONE, EVALUATION_MOVED } from './ratingSchemeLifecycleFailure.server';
import {
	mapRatingSchemeEntry,
	ratingSchemeCreateValues,
	ratingSchemePatchValues,
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

export function createInMemoryRatingSchemePersistence(
	store: RatingSchemeMemoryStore,
	orgId: string
): RatingSchemePersistence {
	async function findEntry(id: string) {
		const row = await store.findOne<RatingSchemeRow>('rating_scheme_entries', orgId, { id });
		if (!row) return fail(404, EVALUATION_GONE);
		return mapRatingSchemeEntry(row);
	}

	return {
		async listWorkspace() {
			return (
				await store.findMany<RatingSchemeRow>('rating_scheme_entries', orgId, undefined, {
					orderBy: [
						{ column: 'rating_period_end', ascending: true },
						{ column: 'id', ascending: true }
					]
				})
			).map(mapRatingSchemeEntry);
		},
		async findWriteReference(id) {
			const row = await store.findOne<RatingSchemeRow>('rating_scheme_entries', orgId, { id });
			return row
				? {
						ratedPersonId: row.rated_person_id,
						raterPersonId: row.rater_person_id,
						seniorRaterPersonId: row.senior_rater_person_id,
						intermediateRaterPersonId: row.intermediate_rater_person_id,
						reviewerPersonId: row.reviewer_person_id
					}
				: null;
		},
		async listPersonReadiness(personnelId) {
			return (
				await store.findMany<RatingSchemeRow>(
					'rating_scheme_entries',
					orgId,
					{ rated_person_id: personnelId },
					{
						orderBy: [
							{ column: 'rating_period_end', ascending: false },
							{ column: 'id', ascending: false }
						]
					}
				)
			).map(mapRatingSchemeEntry);
		},
		async countEntries() {
			const result = await store.findManyWithCount('rating_scheme_entries', orgId, undefined, {
				select: 'id',
				limit: 0,
				count: 'exact'
			});
			return result.count ?? 0;
		},
		async create(input) {
			return mapRatingSchemeEntry(
				await store.insert<RatingSchemeRow>('rating_scheme_entries', orgId, ratingSchemeCreateValues(input))
			);
		},
		async update(id, patch) {
			if (!(await store.findOne('rating_scheme_entries', orgId, { id }))) return null;
			return mapRatingSchemeEntry(
				await store.update<RatingSchemeRow>('rating_scheme_entries', orgId, id, ratingSchemePatchValues(patch))
			);
		},
		delete(id) {
			return store.deleteWhere('rating_scheme_entries', orgId, { id });
		},
		async transition(id, to) {
			const entry = await findEntry(id);
			if (entry.workflowStatus === to) return { entry, moved: false };
			if (!isWorkflowMoveAllowed(entry.workflowStatus, to, workflowRoles(entry))) return fail(409, EVALUATION_MOVED);
			const moved = await store.update<RatingSchemeRow>('rating_scheme_entries', orgId, id, { workflow_status: to });
			return { entry: mapRatingSchemeEntry(moved), moved: true };
		},
		async changeRater(id, change) {
			const entry = await findEntry(id);
			if (isEvaluationCompleted(entry.workflowStatus)) return { entry, successor: null };
			if (change.raterPersonId !== null && change.raterPersonId === entry.raterPersonId) {
				return fail(400, "The new rater is already this evaluation's rater");
			}
			if (change.changeDate < entry.ratingPeriodStart || change.changeDate > entry.ratingPeriodEnd) {
				return fail(400, 'The last day with the current rater must fall within the rating period');
			}
			const closed = await store.update<RatingSchemeRow>('rating_scheme_entries', orgId, id, {
				rating_period_end: change.changeDate,
				report_type: 'CR',
				workflow_status: 'completed'
			});
			const next = parseDate(change.changeDate);
			next.setDate(next.getDate() + 1);
			const start = formatDate(next);
			const successor = await store.insert<RatingSchemeRow>('rating_scheme_entries', orgId, {
				...ratingSchemeCreateValues({
					...entry,
					notes: null,
					reportType: 'AN',
					ratingPeriodStart: start,
					ratingPeriodEnd: start
				}),
				rater_person_id: change.raterPersonId,
				rater_name: change.raterName,
				rating_period_end: calculateThruDate('AN', start)
			});
			return { entry: mapRatingSchemeEntry(closed), successor: mapRatingSchemeEntry(successor) };
		}
	};
}
