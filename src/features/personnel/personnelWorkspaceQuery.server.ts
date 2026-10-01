import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { Personnel, PersonnelLookup } from './personnel.types';
import type {
	PersonnelCalendarStatusSnapshot,
	PersonnelRosterActor,
	PersonnelAwardAcknowledgementPort
} from './contracts';
import { loadRosterPersonnel } from './rosterRead.server';
import { listGroupCatalog } from './groupCatalog.server';
import { listPinnedGroupNames } from './pinnedGroupNames.server';
import { loadOrganizationRankCatalog } from './rankCatalogOperations.server';
import {
	PERSONNEL_WORKSPACE_LANE_KEY,
	type PersonnelWorkspaceData,
	type PersonnelWorkspaceHydrationTarget,
	type PersonnelWorkspaceResult
} from './contracts';

interface PersonnelWorkspaceStore {
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: {
			select?: string;
			orderBy?: Array<{ column: string; ascending: boolean }>;
			isNull?: Record<string, boolean>;
		}
	): Promise<T[]>;
}

interface PersonnelWorkspaceQueryContext {
	auth: PersonnelRosterActor;
	store: PersonnelWorkspaceStore;
	rawStore: PersonnelWorkspaceStore;
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

	const [personnel, allPersonnel, groups, statusTypes, rankCatalog, pinnedGroups, configuredWarningDays, acknowledged] =
		await Promise.all([
			loadRosterPersonnel(ctx, { status: 'active' }),
			loadRosterPersonnel({ auth: ctx.auth, store: ctx.rawStore }, { status: 'active' }),
			listGroupCatalog(ctx),
			sources.listStatusTypes(orgId),
			loadOrganizationRankCatalog(ctx),
			ctx.auth.userId ? listPinnedGroupNames(ctx) : Promise.resolve([]),
			sources.loadLossWarningWindowDays(orgId).catch(() => null),
			ctx.personnelAwardAcknowledgement.listAcknowledgedPersonnelIds(ctx.auth)
		]);

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
