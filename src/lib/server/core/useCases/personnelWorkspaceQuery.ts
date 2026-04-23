import type { FindOptions, QueryWithRawStorePorts, RatingSchemePersonnelLookupRecord } from '$lib/server/core/ports';
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

const activePersonnelFindOptions: FindOptions = {
	select: PersonnelEntity.select,
	orderBy: [{ column: 'last_name', ascending: true }],
	isNull: { archived_at: true }
};

const ratingSchemePersonnelLookupFindOptions: FindOptions = {
	select: 'id, rank, last_name, first_name',
	orderBy: [{ column: 'last_name', ascending: true }],
	isNull: { archived_at: true }
};

function toPersonnelLookup(rows: Personnel[]): PersonnelLookup[] {
	return rows.map((person) => ({
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName
	}));
}

function toPersonnelLookupFromRatingSchemeRecords(rows: RatingSchemePersonnelLookupRecord[]): PersonnelLookup[] {
	return rows.map((person) => ({
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName
	}));
}

function toPersonnelLookupFromDbProjection(rows: Record<string, unknown>[]): PersonnelLookup[] {
	return rows.map((row) => ({
		id: String(row.id),
		rank: typeof row.rank === 'string' ? row.rank : '',
		lastName: typeof row.last_name === 'string' ? row.last_name : '',
		firstName: typeof row.first_name === 'string' ? row.first_name : ''
	}));
}

async function loadRatingSchemePersonnelLookup(ctx: QueryWithRawStorePorts): Promise<PersonnelLookup[]> {
	const orgId = ctx.auth.orgId;

	if (ctx.ratingSchemePersonnelLookup) {
		const records = await ctx.ratingSchemePersonnelLookup.listPersonnelLookup(orgId);
		return toPersonnelLookupFromRatingSchemeRecords(records);
	}

	const personnelRows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel',
		orgId,
		undefined,
		ratingSchemePersonnelLookupFindOptions
	);
	return toPersonnelLookupFromDbProjection(personnelRows);
}

async function loadRatingSchemeSharedData(
	ctx: QueryWithRawStorePorts,
	options: { includePersonnelLookup: boolean; includeAwardTracking: boolean }
): Promise<{
	personnelLookup: PersonnelLookup[];
	ratingSchemeEntries: RatingSchemeEntry[];
	lossWarningWindowDays: number;
	awardTrackingAcknowledgedPersonnelIds: string[];
}> {
	const orgId = ctx.auth.orgId;

	const [personnelLookup, ratingSchemeRows, orgSettingsRow, awardTrackingAcknowledgedPersonnelIds] = await Promise.all([
		options.includePersonnelLookup ? loadRatingSchemePersonnelLookup(ctx) : Promise.resolve([]),
		ctx.store.findMany<Record<string, unknown>>('rating_scheme_entries', orgId, undefined, {
			orderBy: [{ column: 'rating_period_end', ascending: true }]
		}),
		ctx.store
			.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
			.catch(() => null),
		options.includeAwardTracking ? listAwardTrackingAcknowledgedPersonnelIds(ctx.store, orgId) : Promise.resolve([])
	]);

	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

	return {
		personnelLookup,
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(ratingSchemeRows),
		lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds
	};
}

export async function fetchPersonnelBootstrap(ctx: QueryWithRawStorePorts): Promise<PersonnelBootstrap> {
	const orgId = ctx.auth.orgId;
	const userId = ctx.auth.userId;

	const [personnelRows, allPersonnelRows, groupRows, statusTypeRows, pinnedGroupRows, ratingSchemeSharedData] =
		await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, activePersonnelFindOptions),
			ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, activePersonnelFindOptions),
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
			loadRatingSchemeSharedData(ctx, { includePersonnelLookup: false, includeAwardTracking: true })
		]);

	const scopedAllPersonnelRows = ctx.auth.scopedGroupId ? personnelRows : allPersonnelRows;

	return {
		personnel: PersonnelEntity.fromDbArray(personnelRows),
		personnelLookup: toPersonnelLookup(PersonnelEntity.fromDbArray(scopedAllPersonnelRows)),
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		ratingSchemeEntries: ratingSchemeSharedData.ratingSchemeEntries,
		lossWarningWindowDays: ratingSchemeSharedData.lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds: ratingSchemeSharedData.awardTrackingAcknowledgedPersonnelIds
	};
}

export async function fetchRatingSchemeBootstrap(ctx: QueryWithRawStorePorts): Promise<PersonnelBootstrap> {
	const shared = await loadRatingSchemeSharedData(ctx, {
		includePersonnelLookup: true,
		includeAwardTracking: false
	});

	return {
		personnel: [],
		personnelLookup: shared.personnelLookup,
		groups: [],
		statusTypes: [],
		pinnedGroups: [],
		ratingSchemeEntries: shared.ratingSchemeEntries,
		lossWarningWindowDays: shared.lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds: shared.awardTrackingAcknowledgedPersonnelIds
	};
}
