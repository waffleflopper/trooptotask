import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { Personnel, PersonnelLookup, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { GroupEntity } from '$lib/server/entities/group';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { listAwardTrackingAcknowledgedPersonnelIds } from './personnelAwardTracking';
import { requireFeaturePolicy } from './featurePolicy';
import { loadRosterPersonnel } from './rosterReadModel';
import { loadOrganizationRankCatalog, type OrganizationRankCatalogEntry } from './rankCatalog';

export interface PersonnelBootstrap {
	personnel: Personnel[];
	personnelLookup: PersonnelLookup[];
	groups: Group[];
	statusTypes: StatusType[];
	rankCatalog: OrganizationRankCatalogEntry[];
	pinnedGroups: string[];
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
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.viewRoster, { kind: 'unscoped' }, 'personnel');

	const [
		personnel,
		allPersonnel,
		groupRows,
		statusTypeRows,
		rankCatalog,
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
			select: StatusTypeEntity.select,
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		loadOrganizationRankCatalog(ctx),
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
		rankCatalog,
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds
	};
}
