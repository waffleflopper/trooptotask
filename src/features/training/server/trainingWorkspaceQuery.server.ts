import type {
	PersonnelTrainingRosterPort,
	RankCatalogEntry,
	Group,
	GroupPersistence,
	SelfPinPersistence
} from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType, TrainingView, TrainingWorkspaceData } from '../contracts';
import { listTrainingCompletions } from './trainingCompletionRead.server';
import type { TrainingCatalogPersistence } from '../contracts';
import type { TrainingCompletionReadContext } from './trainingCompletionPorts.server';
import { withTrainingTiming, type TrainingLoadPhase } from './trainingTiming.server';
import { visiblePinnedGroupNames } from '$features/personnel/index.server';

type TrainingWorkspaceQueryContext = TrainingCompletionReadContext & {
	readonly loadRankCatalog: () => Promise<RankCatalogEntry[]>;
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypes' | 'listViews'>;
	readonly groups: Pick<GroupPersistence, 'listCatalog'>;
	readonly selfPins: Pick<SelfPinPersistence, 'listNames'>;
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
	return ctx.loadRankCatalog();
}

export function fetchTrainingWorkspaceData(
	ctx: TrainingWorkspaceQueryContext,
	requestedOrgId: string
): TrainingWorkspaceData {
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
		load: () => ctx.groups.listCatalog(),
		mapRows: (groups): Group[] => groups
	});
	const trainingTypes = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'training types',
		phase: 'training-types',
		load: () => ctx.trainingCatalog.listTypes(),
		mapRows: (types): TrainingType[] => types
	});
	const trainingViews = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'training views',
		phase: 'training-views',
		load: () => ctx.trainingCatalog.listViews(),
		mapRows: (views): TrainingView[] => views
	});
	const pinnedGroups = loadTrainingItems({
		orgId: requestedOrgId,
		label: 'pinned groups',
		phase: 'pinned-groups',
		load: () => Promise.all([ctx.selfPins.listNames(), groups]),
		mapRows: ([names, visibleGroups]) => visiblePinnedGroupNames(names, visibleGroups)
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
