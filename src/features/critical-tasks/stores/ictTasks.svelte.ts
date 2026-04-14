import { defineStore } from '$lib/stores/core';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';

export const ictTasksStore = defineStore<IctTask>({
	table: 'ict_tasks',
	orderBy: [{ field: 'sortOrder' }, { field: 'taskCode' }]
});
