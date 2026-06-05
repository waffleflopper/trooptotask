import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
import { criticalTasksWorkspaceStatus } from '$features/critical-tasks/criticalTasksWorkspaceHydration.svelte';

interface CriticalTasksWorkspaceData {
	settings?: CriticalTasksSettings | null;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'then' in value &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

export function criticalTasksSettingsFromWorkspaceData(data: unknown): CriticalTasksSettings | undefined {
	if (!data || typeof data !== 'object') {
		return undefined;
	}

	const orgId = (data as { orgId?: unknown }).orgId;
	const criticalTasks = (data as { criticalTasks?: { data?: CriticalTasksWorkspaceData | Promise<unknown> | null } })
		.criticalTasks;
	const workspaceData = criticalTasks?.data;

	if (!workspaceData) {
		return undefined;
	}

	if (isPromiseLike(workspaceData)) {
		return typeof orgId === 'string' && criticalTasksWorkspaceStatus.orgId === orgId
			? (criticalTasksWorkspaceStatus.settings ?? undefined)
			: undefined;
	}

	return workspaceData.settings ?? undefined;
}
