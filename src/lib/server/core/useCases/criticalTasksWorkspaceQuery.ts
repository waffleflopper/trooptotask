import type { QueryPorts } from '$lib/server/core/ports';
import type { CriticalTasksWorkspaceData } from '$features/critical-tasks/contracts';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$features/personnel/contracts';
import { listGroupCatalog } from '$features/personnel/index.server';
import { fetchCriticalTasksSettings } from '$features/critical-tasks/server/criticalTasksSettingsRead.server';
import { IctTaskEntity } from '$features/critical-tasks/index.server';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';

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
	ctx: QueryPorts,
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
