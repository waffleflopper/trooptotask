import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { Personnel, PersonnelLookup } from './personnel.types';
import type {
	PersonnelCalendarStatusSnapshot,
	PersonnelRosterActor,
	PersonnelAwardAcknowledgementPort
} from './contracts';
import { loadRosterPersonnel } from './rosterRead.server';
import { listPinnedGroupNames } from './pinnedGroupNames.server';
import { listGroupCatalog, visiblePinnedGroupNames } from './groupCatalog.server';
import type { OrganizationRankCatalogEntry } from './rankCatalogContracts';
import type { PersonnelRosterReader, GroupPersistence, SelfPinPersistence } from './contracts';
import {
	PERSONNEL_WORKSPACE_LANE_KEY,
	type PersonnelWorkspaceData,
	type PersonnelWorkspaceHydrationTarget,
	type PersonnelWorkspaceResult
} from './contracts';

interface PersonnelWorkspaceQueryContext {
	auth: PersonnelRosterActor;
	roster: PersonnelRosterReader;
	organizationRoster: PersonnelRosterReader;
	groups: Pick<GroupPersistence, 'listCatalog'>;
	selfPins: Pick<SelfPinPersistence, 'listNames'>;
	loadRankCatalog(): Promise<OrganizationRankCatalogEntry[]>;
	personnelAwardAcknowledgement?: PersonnelAwardAcknowledgementPort;
}

/** Delivery supplies adjacent owners' reads using the admitted request context. */
export interface PersonnelWorkspaceSources {
	listStatusTypes(orgId: string): Promise<PersonnelCalendarStatusSnapshot[]>;
	loadLossWarningWindowDays(orgId: string): Promise<number | null>;
}

function toPersonnelLookup(rows: Personnel[]): PersonnelLookup[] {
	return rows.map((person) => ({
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName
	}));
}

function hydrationTarget<T>(items: T[]): PersonnelWorkspaceHydrationTarget<T> {
	return { mode: 'replace', deferred: false, snapshotKey: `resolved:${crypto.randomUUID()}`, items };
}

export async function loadPersonnelWorkspace(
	ctx: PersonnelWorkspaceQueryContext,
	sources: PersonnelWorkspaceSources
): Promise<PersonnelWorkspaceResult> {
	const orgId = ctx.auth.orgId;
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.viewRoster, { kind: 'unscoped' }, 'personnel');
	if (!ctx.personnelAwardAcknowledgement) throw new Error('Personnel award acknowledgement port is required');

	const [personnel, allPersonnel, groups, statusTypes, rankCatalog, pinnedNames, configuredWarningDays, acknowledged] =
		await Promise.all([
			loadRosterPersonnel(ctx, { status: 'active' }),
			loadRosterPersonnel({ roster: ctx.organizationRoster }, { status: 'active' }),
			listGroupCatalog(ctx),
			sources.listStatusTypes(orgId),
			ctx.loadRankCatalog(),
			ctx.auth.userId ? listPinnedGroupNames(ctx) : Promise.resolve([]),
			sources.loadLossWarningWindowDays(orgId).catch(() => null),
			ctx.personnelAwardAcknowledgement.listAcknowledgedPersonnelIds(ctx.auth)
		]);

	const pinnedGroups = visiblePinnedGroupNames(pinnedNames, groups);
	const scopedAllPersonnel = ctx.auth.scopeSet.kind === 'groups' ? personnel : allPersonnel;
	const data: PersonnelWorkspaceData = {
		personnel,
		personnelLookup: toPersonnelLookup(scopedAllPersonnel),
		groups,
		statusTypes,
		rankCatalog,
		pinnedGroups,
		lossWarningWindowDays: configuredWarningDays ?? 180,
		awardTrackingAcknowledgedPersonnelIds: acknowledged
	};

	return {
		laneKey: PERSONNEL_WORKSPACE_LANE_KEY,
		data,
		hydration: {
			orgId,
			personnel: hydrationTarget(personnel),
			groups: hydrationTarget(groups),
			statusTypes: hydrationTarget(statusTypes),
			pinnedGroups: hydrationTarget(pinnedGroups)
		}
	};
}
