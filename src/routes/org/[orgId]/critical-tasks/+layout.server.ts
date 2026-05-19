import { error } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabaseCriticalTasksWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, StreamableOrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { CriticalTasksBootstrap } from '$lib/server/core/orgShell';
import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';

interface CriticalTasksLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

interface CriticalTasksSettingsRequestContext {
	locals: App.Locals;
	orgId: string;
}

export interface CriticalTasksLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: CriticalTasksLayoutRequestContext) => StreamableOrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
	loadCriticalTasksSettings?: (context: CriticalTasksSettingsRequestContext) => Promise<CriticalTasksSettings>;
}

async function loadCriticalTasksSettings({
	locals,
	orgId
}: CriticalTasksSettingsRequestContext): Promise<CriticalTasksSettings> {
	const { data, error: queryError } = await locals.supabase
		.from('organizations')
		.select('critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days')
		.eq('id', orgId)
		.single();

	if (queryError) {
		throw error(500, queryError.message);
	}

	return normalizeCriticalTasksSettings({
		defaultExpirationMonths: data?.critical_tasks_default_expiration_months ?? null,
		expiringSoonWarningDays: data?.critical_tasks_expiring_soon_warning_days ?? null
	});
}

export function _createCriticalTasksLayoutLoad(deps: CriticalTasksLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId }: CriticalTasksLayoutRequestContext) =>
			createSupabaseCriticalTasksWorkspacePort(locals, cookies, orgId));
	const createPlannerPort = deps.createPlannerPort ?? createDefaultHydrationPlanner;
	const loadCriticalTasksSettingsFn = deps.loadCriticalTasksSettings ?? loadCriticalTasksSettings;

	return async ({
		params,
		locals,
		cookies,
		depends
	}: {
		params: { orgId: string };
		locals: App.Locals;
		cookies: Cookies;
		depends: (...deps: string[]) => void;
	}) => {
		depends('app:org-core', 'app:critical-tasks-data');

		const { orgId } = params;
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);
		const criticalTasksSettings = await loadCriticalTasksSettingsFn({ locals, orgId });
		const streamed = await coordinator.streamWorkspace<CriticalTasksBootstrap, 'critical-tasks'>('critical-tasks', {
			workspace: workspacePort,
			planner: plannerPort
		});

		return {
			criticalTasks: streamed['critical-tasks'],
			criticalTasksSettings
		};
	};
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();
