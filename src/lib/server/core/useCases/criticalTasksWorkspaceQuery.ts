import type { QueryPorts } from '$lib/server/core/ports';
import type { CriticalTasksWorkspaceData } from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';
import type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
import { GroupEntity } from '$lib/server/entities/group';
import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { loadRosterPersonnel } from './rosterReadModel';

interface OrgCriticalTasksSettingsRow {
	critical_tasks_default_expiration_months?: number | null;
	critical_tasks_expiring_soon_warning_days?: number | null;
}

export interface CriticalTasksBootstrapOptions {
	includeArchivedTasks?: boolean;
}

export async function fetchCriticalTasksSettings(
	ctx: Pick<QueryPorts, 'auth' | 'store'>
): Promise<CriticalTasksSettings> {
	const orgId = ctx.auth.orgId;
	const settingsRow = await ctx.store.findOne<OrgCriticalTasksSettingsRow>(
		'organizations',
		orgId,
		{ id: orgId },
		'critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
	);

	return normalizeCriticalTasksSettings({
		defaultExpirationMonths: settingsRow?.critical_tasks_default_expiration_months ?? null,
		expiringSoonWarningDays: settingsRow?.critical_tasks_expiring_soon_warning_days ?? null
	});
}

function loadCriticalTasksItems<T>(
	orgId: string,
	label: string,
	load: Promise<Record<string, unknown>[]>,
	mapRows: (rows: Record<string, unknown>[]) => T
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
	const personnel = loadRosterPersonnel(ctx, { status: 'active' }).catch((error) => {
		console.error('[critical-tasks-workspace] Failed to load personnel', {
			orgId,
			error
		});
		throw error;
	}) as Promise<Personnel[]>;
	const groups = loadCriticalTasksItems(
		orgId,
		'groups',
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		(rows) => GroupEntity.fromDbArray(rows) as Group[]
	);
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
