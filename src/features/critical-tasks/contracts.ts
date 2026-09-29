import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$lib/types';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from './criticalTasks.types';

export interface CriticalTasksSettingsWritePort {
	saveDefaults(
		orgId: string,
		defaults: { defaultExpirationMonths: number | null; expiringSoonWarningDays: number | null }
	): Promise<void>;
}

export const CRITICAL_TASKS_WORKSPACE_LANE_KEY = 'critical-tasks' as const;

type CriticalTasksWorkspaceItems<T> = T[] | Promise<T[]>;

export interface CriticalTasksWorkspaceData {
	settings: CriticalTasksSettings;
	personnel: CriticalTasksWorkspaceItems<Personnel>;
	groups: CriticalTasksWorkspaceItems<Group>;
	ictTasks: CriticalTasksWorkspaceItems<IctTask>;
	personnelIctCompletions: CriticalTasksWorkspaceItems<PersonnelIctCompletion>;
}

export type CriticalTasksWorkspaceHydrationMode = 'replace' | 'preserve-client';

export interface CriticalTasksWorkspaceHydrationTarget<T> {
	mode: CriticalTasksWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: CriticalTasksWorkspaceItems<T>;
}

export interface CriticalTasksWorkspaceHydration {
	orgId: string;
	personnel: CriticalTasksWorkspaceHydrationTarget<Personnel>;
	groups: CriticalTasksWorkspaceHydrationTarget<Group>;
	ictTasks: CriticalTasksWorkspaceHydrationTarget<IctTask>;
	personnelIctCompletions: CriticalTasksWorkspaceHydrationTarget<PersonnelIctCompletion>;
}

export interface CriticalTasksWorkspaceResult {
	laneKey: typeof CRITICAL_TASKS_WORKSPACE_LANE_KEY;
	data: CriticalTasksWorkspaceData;
	hydration: CriticalTasksWorkspaceHydration;
}
