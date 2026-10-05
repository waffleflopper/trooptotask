import type {
	CriticalTaskLibraryPersistence,
	CriticalTasksReadModelPort,
	CriticalTasksWorkspaceData
} from '../contracts';
import type { PersonnelRosterActor, PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';
import { listGroupCatalog } from '$features/personnel/index.server';
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';

interface CriticalTasksWorkspaceQueryContext {
	auth: PersonnelRosterActor;
	store: {
		findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
		findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: {
				select?: string;
				isNull?: Record<string, boolean>;
				inFilters?: Record<string, string[]>;
				orderBy?: Array<{ column: string; ascending: boolean }>;
			}
		): Promise<T[]>;
	};
	personnelCriticalTasksRoster?: Pick<PersonnelCriticalTasksRosterPort, 'listActiveForReadiness'>;
	criticalTasksReadModel: CriticalTasksReadModelPort;
	criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listCatalog'>;
}

export interface CriticalTasksBootstrapOptions {
	includeArchivedTasks?: boolean;
}

function loadCriticalTasksItems<T>(orgId: string, label: string, load: Promise<T>): Promise<T> {
	return load.catch((error) => {
		console.error(`[critical-tasks-workspace] Failed to load ${label}`, {
			orgId,
			error
		});
		throw error;
	});
}

export async function fetchCriticalTasksBootstrap(
	ctx: CriticalTasksWorkspaceQueryContext,
	options: CriticalTasksBootstrapOptions = {}
): Promise<CriticalTasksWorkspaceData> {
	const orgId = ctx.auth.orgId;
	const settings = await fetchCriticalTasksSettings(ctx);
	if (!ctx.personnelCriticalTasksRoster) throw new Error('Personnel Critical Tasks roster provider unavailable');
	const personnel = ctx.personnelCriticalTasksRoster.listActiveForReadiness(ctx.auth).catch((error) => {
		console.error('[critical-tasks-workspace] Failed to load personnel', {
			orgId,
			error
		});
		throw error;
	});
	const groups = loadCriticalTasksItems(orgId, 'groups', listGroupCatalog(ctx));
	const ictTasks = loadCriticalTasksItems(
		orgId,
		'ICT tasks',
		ctx.criticalTaskLibrary.listCatalog({ includeArchived: options.includeArchivedTasks })
	);
	const personnelIctCompletions = Promise.all([personnel, ictTasks])
		.then(([loadedPersonnel, loadedTasks]) =>
			ctx.criticalTasksReadModel.findLatestCompletions(orgId, {
				personnelIds: loadedPersonnel.map((person) => person.id),
				taskIds: loadedTasks.map((task) => task.id)
			})
		)
		.catch((error) => {
			console.error('[critical-tasks-workspace] Failed to load personnel ICT completions', {
				orgId,
				error
			});
			throw error;
		});

	return {
		settings,
		personnel,
		groups,
		ictTasks,
		personnelIctCompletions
	};
}
