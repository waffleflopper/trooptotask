import { listGroupCatalog, listPinnedGroupNames, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { PersonnelTrainingRosterPort, RankCatalogEntry, Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType, TrainingView, TrainingWorkspaceData } from '../contracts';
import { listTrainingTypes, listTrainingViews } from './trainingCatalogRead.server';
import { listTrainingCompletions } from './trainingCompletionRead.server';
import type { TrainingCatalogReadStore } from './trainingCatalogPorts.server';
import type { TrainingCompletionReadContext } from './trainingCompletionPorts.server';
import { withTrainingTiming, type TrainingLoadPhase } from './trainingTiming.server';

type TrainingWorkspaceQueryContext = Omit<TrainingCompletionReadContext, 'store'> & {
	readonly store: TrainingCatalogReadStore & Parameters<typeof loadOrganizationRankCatalog>[0]['store'];
	readonly audit?: TrainingCompletionReadContext['audit'];
	readonly personnelTrainingRoster: Pick<PersonnelTrainingRosterPort, 'listActiveForWorkspace'>;
};

function loadTrainingItems<R, T>(config: {
	orgId: string;
	label: string;
	phase: TrainingLoadPhase;
	load: () => Promise<R>;
	mapRows: (rows: R) => T;
}): Promise<T> {
	return withTrainingTiming(config.orgId, config.phase, () => config.load().then(config.mapRows)).catch((error) => {
		console.error(`[training-workspace] Failed to load ${config.label}`, {
			orgId: config.orgId,
			error
		});
		throw error;
	});
}

async function loadTrainingRosterPersonnel(ctx: TrainingWorkspaceQueryContext): Promise<Personnel[]> {
	return ctx.personnelTrainingRoster.listActiveForWorkspace(ctx.auth);
}

async function loadTrainingRankCatalog(ctx: TrainingWorkspaceQueryContext): Promise<RankCatalogEntry[]> {
	return loadOrganizationRankCatalog(ctx, { authorization: 'training-view' });
}

export function fetchTrainingWorkspaceData(
	ctx: TrainingWorkspaceQueryContext,
	requestedOrgId: string
): TrainingWorkspaceData {
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
		load: () => listGroupCatalog(ctx),
		mapRows: (groups): Group[] => groups
	});
	const trainingTypes = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'training types',
		phase: 'training-types',
		load: () => listTrainingTypes(ctx.store, canonicalOrgId),
		mapRows: (types): TrainingType[] => types
	});
	const trainingViews = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'training views',
		phase: 'training-views',
		load: () => listTrainingViews(ctx.store, canonicalOrgId),
		mapRows: (views): TrainingView[] => views
	});
	const pinnedGroups = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'pinned groups',
		phase: 'pinned-groups',
		load: () => listPinnedGroupNames(ctx),
		mapRows: (names) => names
	});
	const personnelTrainings = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'personnel trainings',
		phase: 'personnel-trainings',
		load: () => listTrainingCompletions(ctx),
		mapRows: (trainings) => trainings
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
