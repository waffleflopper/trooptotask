import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { Personnel, PersonnelLookup, StatusType } from '$lib/types';
import type { Group } from '$features/personnel/contracts';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { listAwardTrackingAcknowledgedPersonnelIds } from './personnelAwardTracking';
import { requireFeaturePolicy } from './featurePolicy';
import { listGroupCatalog, listPinnedGroupNames, loadRosterPersonnel } from '$features/personnel/index.server';
import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { OrganizationRankCatalogEntry } from '$features/personnel/contracts';

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
		groups,
		statusTypeRows,
		rankCatalog,
		pinnedGroups,
		orgSettingsRow,
		awardTrackingAcknowledgedPersonnelIds
	] = await Promise.all([
		loadRosterPersonnel(ctx, { status: 'active' }),
		loadRosterPersonnel({ auth: ctx.auth, store: ctx.rawStore }, { status: 'active' }),
		listGroupCatalog(ctx),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			select: StatusTypeEntity.select,
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		loadOrganizationRankCatalog(ctx),
		userId ? listPinnedGroupNames(ctx) : Promise.resolve([]),
		ctx.store
			.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
			.catch(() => null),
		listAwardTrackingAcknowledgedPersonnelIds(ctx)
	]);

	const scopedAllPersonnel = ctx.auth.scopeSet.kind === 'groups' ? personnel : allPersonnel;
	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

	return {
		personnel,
		personnelLookup: toPersonnelLookup(scopedAllPersonnel),
		groups,
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		rankCatalog,
		pinnedGroups,
		lossWarningWindowDays,
		awardTrackingAcknowledgedPersonnelIds
	};
}
