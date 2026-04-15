import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { Personnel, PersonnelLookup, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { listAwardTrackingAcknowledgedPersonnelIds } from './personnelAwardTracking';

export interface PersonnelBootstrap {
	personnel: Personnel[];
	personnelLookup: PersonnelLookup[];
	groups: Group[];
	statusTypes: StatusType[];
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeEntry[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
	/** Personnel IDs whose award tracking has been acknowledged. */
	awardTrackingAcknowledgedPersonnelIds: string[];
}

function toPersonnelLookup(rows: Personnel[]): PersonnelLookup[] {
	return rows.map((person) => ({
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName
	}));
}

export async function fetchPersonnelBootstrap(ctx: QueryWithRawStorePorts): Promise<PersonnelBootstrap> {
	const orgId = ctx.auth.orgId;
	const userId = ctx.auth.userId;
	const findOptions = {
		select: PersonnelEntity.select,
		orderBy: [{ column: 'last_name', ascending: true }],
		isNull: { archived_at: true }
	};

	const [
		personnelRows,
		allPersonnelRows,
		groupRows,
		statusTypeRows,
		pinnedGroupRows,
		ratingSchemeRows,
		orgSettingsRow,
		awardTrackingAcknowledgedPersonnelIds
	] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, findOptions),
		ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, findOptions),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
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
		}),
		ctx.store
			.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
			.catch(() => null),
		listAwardTrackingAcknowledgedPersonnelIds(ctx.store, orgId)
	]);

	const scopedAllPersonnelRows = ctx.auth.scopedGroupId ? personnelRows : allPersonnelRows;
	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

	return {
		personnel: PersonnelEntity.fromDbArray(personnelRows),
		personnelLookup: toPersonnelLookup(PersonnelEntity.fromDbArray(scopedAllPersonnelRows)),
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows),
		lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds
	};
}
