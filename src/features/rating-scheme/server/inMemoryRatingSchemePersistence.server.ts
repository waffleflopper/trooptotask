import type { RatingSchemePersistence } from '../contracts';
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
		}
	};
}
