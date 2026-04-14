import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { HydrationItems } from '$lib/server/core/orgShell';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

export interface CriticalTasksBootstrap {
	personnelIctCompletions: HydrationItems<PersonnelIctCompletion>;
	ictTasks: HydrationItems<IctTask>;
	personnel: HydrationItems<Personnel>;
	groups: HydrationItems<Group>;
}
