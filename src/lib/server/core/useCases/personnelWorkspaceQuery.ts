import type { QueryWithRawStorePorts, RatingSchemePersonnelLookupRecord } from '$lib/server/core/ports';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { Personnel, PersonnelLookup, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { GroupEntity } from '$lib/server/entities/group';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { listAwardTrackingAcknowledgedPersonnelIds } from './personnelAwardTracking';
import { requireFeaturePolicy } from './featurePolicy';
import { loadRosterPersonnel } from './rosterReadModel';

export interface PersonnelBootstrap {
	personnel: Personnel[];
	personnelLookup: PersonnelLookup[];
	groups: Group[];
	statusTypes: StatusType[];
	pinnedGroups: string[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
	/** Personnel IDs whose award tracking has been acknowledged. */
	awardTrackingAcknowledgedPersonnelIds: string[];
}

export interface RatingSchemeBootstrap {
	personnelLookup: PersonnelLookup[];
	ratingSchemeEntries: RatingSchemeEntry[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
}

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

async function loadRatingSchemePersonnelLookup(ctx: QueryWithRawStorePorts): Promise<PersonnelLookup[]> {
	const orgId = ctx.auth.orgId;

	if (ctx.ratingSchemePersonnelLookup) {
		const records = await ctx.ratingSchemePersonnelLookup.listPersonnelLookup(orgId);
		return toPersonnelLookupFromRatingSchemeRecords(records);
	}

	throw new Error('Rating Scheme personnel lookup port is required');
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
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.viewRoster, { kind: 'unscoped' }, 'personnel');

	const [
		personnel,
		allPersonnel,
		groupRows,
		statusTypeRows,
		pinnedGroupRows,
		orgSettingsRow,
		awardTrackingAcknowledgedPersonnelIds
	] = await Promise.all([
		loadRosterPersonnel(ctx, { status: 'active' }),
		loadRosterPersonnel({ auth: ctx.auth, store: ctx.rawStore }, { status: 'active' }),
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
		ctx.store
			.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
			.catch(() => null),
		listAwardTrackingAcknowledgedPersonnelIds(ctx.store, orgId)
	]);

	const scopedAllPersonnel = ctx.auth.scopeSet.kind === 'groups' ? personnel : allPersonnel;
	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

	return {
		personnel,
		personnelLookup: toPersonnelLookup(scopedAllPersonnel),
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds
	};
}

export async function fetchRatingSchemeBootstrap(ctx: QueryWithRawStorePorts): Promise<RatingSchemeBootstrap> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.ratingScheme.viewEntries,
		{ kind: 'unscoped' },
		'rating-scheme'
	);
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.ratingScheme.readRosterReferences,
		{ kind: 'unscoped' },
		'rating-scheme'
	);
	const shared = await loadRatingSchemeSharedData(ctx, {
		includePersonnelLookup: true,
		includeAwardTracking: false
	});

	return {
		personnelLookup: shared.personnelLookup,
		ratingSchemeEntries: shared.ratingSchemeEntries,
		lossWarningWindowDays: shared.lossWarningWindowDays
	};
}
