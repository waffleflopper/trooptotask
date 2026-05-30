import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';

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

	const criticalTasks = (data as { criticalTasks?: { data?: CriticalTasksWorkspaceData | Promise<unknown> | null } })
		.criticalTasks;
	const workspaceData = criticalTasks?.data;

	if (!workspaceData || isPromiseLike(workspaceData)) {
		return undefined;
	}

	return workspaceData.settings ?? undefined;
}
