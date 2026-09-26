import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { GroupEntity } from '$lib/server/entities/group';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createWorkspaceHydrationTarget,
	type DeferredData,
	type HydrationItems,
	type WorkspaceHydrationTarget
} from '$lib/server/core/streamedWorkspace';
import type { RankCatalogEntry } from '$lib/domain/rankCatalog';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadOrganizationRankCatalog } from '$lib/server/core/useCases/rankCatalog';
import { withTrainingTiming, type TrainingLoadPhase } from '$lib/server/utils/trainingTiming';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$lib/types';
import type { PersonnelTraining, TrainingType, TrainingView } from '../training.types';

export const TRAINING_WORKSPACE_LANE_KEY = 'training' as const;

export interface TrainingWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface TrainingWorkspaceData {
	personnelTrainings: HydrationItems<PersonnelTraining>;
	trainingTypes: HydrationItems<TrainingType>;
	trainingViews: HydrationItems<TrainingView>;
	personnel: HydrationItems<Personnel>;
	groups: HydrationItems<Group>;
	pinnedGroups: HydrationItems<string>;
	rankCatalog?: HydrationItems<RankCatalogEntry>;
}

export type TrainingWorkspaceHydrationMode = 'replace' | 'preserve-client';

export type TrainingWorkspaceHydrationTarget<T> = WorkspaceHydrationTarget<T, TrainingWorkspaceHydrationMode>;

export interface TrainingWorkspaceHydration {
	orgId: string;
	personnel: TrainingWorkspaceHydrationTarget<Personnel>;
	groups: TrainingWorkspaceHydrationTarget<Group>;
	trainingTypes: TrainingWorkspaceHydrationTarget<TrainingType>;
	trainingViews: TrainingWorkspaceHydrationTarget<TrainingView>;
	personnelTrainings: TrainingWorkspaceHydrationTarget<PersonnelTraining>;
	pinnedGroups: TrainingWorkspaceHydrationTarget<string>;
	rankCatalog?: TrainingWorkspaceHydrationTarget<RankCatalogEntry>;
}

export interface TrainingWorkspaceResult {
	laneKey: typeof TRAINING_WORKSPACE_LANE_KEY;
	data: TrainingWorkspaceData;
	hydration: TrainingWorkspaceHydration;
}

export interface TrainingWorkspaceRouteData {
	[TRAINING_WORKSPACE_LANE_KEY]: DeferredData<TrainingWorkspaceResult>;
}

function createTrainingHydrationTarget<T>(items: HydrationItems<T>): TrainingWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'json' });
}

function createTrainingWorkspaceHydration(orgId: string, data: TrainingWorkspaceData): TrainingWorkspaceHydration {
	const hydration: TrainingWorkspaceHydration = {
		orgId,
		personnel: createTrainingHydrationTarget(data.personnel),
		groups: createTrainingHydrationTarget(data.groups),
		trainingTypes: createTrainingHydrationTarget(data.trainingTypes),
		trainingViews: createTrainingHydrationTarget(data.trainingViews),
		personnelTrainings: createTrainingHydrationTarget(data.personnelTrainings),
		pinnedGroups: createTrainingHydrationTarget(data.pinnedGroups)
	};
	if (data.rankCatalog) {
		hydration.rankCatalog = createTrainingHydrationTarget(data.rankCatalog);
	}
	return hydration;
}

function loadTrainingItems<T>(config: {
	orgId: string;
	label: string;
	phase: TrainingLoadPhase;
	load: () => Promise<Record<string, unknown>[]>;
	mapRows: (rows: Record<string, unknown>[]) => T;
}): Promise<T> {
	return withTrainingTiming(config.orgId, config.phase, () => config.load().then(config.mapRows)).catch((error) => {
		console.error(`[training-workspace] Failed to load ${config.label}`, {
			orgId: config.orgId,
			error
		});
		throw error;
	});
}

async function loadTrainingRosterPersonnel(ctx: UseCaseContext): Promise<Personnel[]> {
	return ctx.personnelTrainingRoster.listActiveForWorkspace(ctx.auth);
}

async function loadTrainingRankCatalog(ctx: UseCaseContext): Promise<RankCatalogEntry[]> {
	return loadOrganizationRankCatalog(ctx, { authorization: 'training-view' });
}

function fetchTrainingWorkspaceData(ctx: UseCaseContext, requestedOrgId: string): TrainingWorkspaceData {
	const canonicalOrgId = ctx.auth.orgId;
	const personnel = withTrainingTiming(requestedOrgId, 'personnel', () => loadTrainingRosterPersonnel(ctx)).catch(
		(error) => {
			console.error('[training-workspace] Failed to load personnel', {
				orgId: requestedOrgId,
				error
			});
			throw error;
		}
	);
	const groups = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'groups',
		phase: 'groups',
		load: () =>
			ctx.store.findMany<Record<string, unknown>>('groups', canonicalOrgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
		mapRows: (rows) => GroupEntity.fromDbArray(rows) as Group[]
	});
	const trainingTypes = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'training types',
		phase: 'training-types',
		load: () =>
			ctx.store.findMany<Record<string, unknown>>('training_types', canonicalOrgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
		mapRows: (rows) => TrainingTypeEntity.fromDbArray(rows) as TrainingType[]
	});
	const trainingViews = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'training views',
		phase: 'training-views',
		load: () =>
			ctx.store.findMany<Record<string, unknown>>('training_views', canonicalOrgId, undefined, {
				orderBy: [{ column: 'name', ascending: true }]
			}),
		mapRows: (rows) => TrainingViewEntity.fromDbArray(rows) as TrainingView[]
	});
	const pinnedGroups = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'pinned groups',
		phase: 'pinned-groups',
		load: () =>
			ctx.store.findMany<Record<string, unknown>>(
				'user_pinned_groups',
				canonicalOrgId,
				{ user_id: ctx.auth.userId },
				{
					orderBy: [{ column: 'sort_order', ascending: true }]
				}
			),
		mapRows: (rows) => PinnedGroupsEntity.fromDbArray(rows)
	});
	const personnelTrainings = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'personnel trainings',
		phase: 'personnel-trainings',
		load: () => ctx.store.findMany<Record<string, unknown>>('personnel_trainings', canonicalOrgId),
		mapRows: (rows) => PersonnelTrainingEntity.fromDbArray(rows) as PersonnelTraining[]
	});
	const rankCatalog = withTrainingTiming(requestedOrgId, 'rank-catalog', () => loadTrainingRankCatalog(ctx));

	return {
		personnel,
		groups,
		pinnedGroups,
		trainingTypes,
		trainingViews,
		personnelTrainings,
		rankCatalog
	};
}

export async function streamTrainingWorkspaceBootstrap(
	context: TrainingWorkspaceRequestContext
): Promise<TrainingWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.training.viewMatrix,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data = fetchTrainingWorkspaceData(ctx, context.orgId);
			return {
				laneKey: TRAINING_WORKSPACE_LANE_KEY,
				data,
				hydration: createTrainingWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies TrainingWorkspaceResult;
		}
	});

	return {
		training: deferred
	};
}
