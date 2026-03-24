import type { UseCaseContext } from '$lib/server/core/ports';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';

export interface PersonnelPageData {
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeEntry[];
}

export async function fetchPersonnelPageData(ctx: UseCaseContext): Promise<PersonnelPageData> {
	const orgId = ctx.auth.orgId;
	const userId = ctx.auth.userId;

	const [pinnedGroupRows, ratingSchemeRows] = await Promise.all([
		userId
			? ctx.store.findMany<Record<string, unknown>>(
					'user_pinned_groups',
					orgId,
					{ user_id: userId },
					{
						orderBy: [{ column: 'sort_order', ascending: true }]
					}
				)
			: Promise.resolve([]),
		ctx.store.findMany<Record<string, unknown>>('rating_scheme_entries', orgId, undefined, {
			orderBy: [{ column: 'rating_period_end', ascending: true }]
		})
	]);

	return {
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows)
	};
}
