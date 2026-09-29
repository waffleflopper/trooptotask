import type { CriticalTasksWorkspaceData } from '../contracts';
import type { IctTask, PersonnelIctCompletion } from '../criticalTasks.types';
import type { Group, PersonnelRosterActor, PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';
import { listGroupCatalog } from '$features/personnel/index.server';
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';
import { IctTaskEntity } from './ictTaskEntity.server';
import { PersonnelIctCompletionEntity } from './personnelIctCompletionEntity.server';

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
	criticalTasksReadModel: {
		findLatestCompletions(
			orgId: string,
			filters: { personnelIds: string[]; taskIds: string[] }
		): Promise<Record<string, unknown>[]>;
	};
}

export interface CriticalTasksBootstrapOptions {
	includeArchivedTasks?: boolean;
}

function loadCriticalTasksItems<R, T>(
	orgId: string,
	label: string,
	load: Promise<R>,
	mapRows: (rows: R) => T
): Promise<T> {
	return load.then(mapRows).catch((error) => {
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
	const groups = loadCriticalTasksItems(orgId, 'groups', listGroupCatalog(ctx), (groups): Group[] => groups);
	const ictTasks = loadCriticalTasksItems(
		orgId,
		'ICT tasks',
		ctx.store.findMany<Record<string, unknown>>('ict_tasks', orgId, undefined, {
			...(options.includeArchivedTasks ? {} : { isNull: { archived_at: true } }),
			orderBy: [
				{ column: 'sort_order', ascending: true },
				{ column: 'task_code', ascending: true }
			]
		}),
		(rows) => IctTaskEntity.fromDbArray(rows) as IctTask[]
	);
	const personnelIctCompletions = Promise.all([personnel, ictTasks])
		.then(([loadedPersonnel, loadedTasks]) =>
			ctx.criticalTasksReadModel.findLatestCompletions(orgId, {
				personnelIds: loadedPersonnel.map((person) => person.id),
				taskIds: loadedTasks.map((task) => task.id)
			})
		)
		.then((rows) => PersonnelIctCompletionEntity.fromDbArray(rows) as PersonnelIctCompletion[])
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
