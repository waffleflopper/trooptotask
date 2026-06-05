import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
import { criticalTasksWorkspaceStatus } from '$features/critical-tasks/criticalTasksWorkspaceHydration.svelte';

interface CriticalTasksWorkspaceData {
	settings?: CriticalTasksSettings | null;
}

function readDataOrgId(data: Record<string, unknown>): string | undefined {
	const routeOrgId = data.orgId;
	if (typeof routeOrgId === 'string') {
		return routeOrgId;
	}

	const shell = data.shell;
	if (!shell || typeof shell !== 'object') {
		return undefined;
	}

	const org = (shell as { org?: unknown }).org;
	if (!org || typeof org !== 'object') {
		return undefined;
	}

	const shellOrgId = (org as { id?: unknown }).id;
	return typeof shellOrgId === 'string' ? shellOrgId : undefined;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'then' in value &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

export function criticalTasksSettingsFromWorkspaceData(
	data: unknown,
	orgId?: string | null
): CriticalTasksSettings | undefined {
	if (!data || typeof data !== 'object') {
		return undefined;
	}

	const routeData = data as Record<string, unknown>;
	const expectedOrgId = orgId ?? readDataOrgId(routeData);
	const criticalTasks = (
		routeData as { criticalTasks?: { data?: CriticalTasksWorkspaceData | Promise<unknown> | null } }
	).criticalTasks;
	const workspaceData = criticalTasks?.data;

	if (!workspaceData) {
		return undefined;
	}

	if (isPromiseLike(workspaceData)) {
		return expectedOrgId && criticalTasksWorkspaceStatus.orgId === expectedOrgId
			? (criticalTasksWorkspaceStatus.settings ?? undefined)
			: undefined;
	}

	return workspaceData.settings ?? undefined;
}
