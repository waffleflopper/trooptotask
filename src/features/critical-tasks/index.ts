export { default as IctCompletionModal } from './components/IctCompletionModal.svelte';
export { default as IctMatrix } from './components/IctMatrix.svelte';
export { default as IctTaskLibraryPage } from './components/IctTaskLibraryPage.svelte';
export { default as IctReportsView } from './components/IctReportsView.svelte';
export { default as IctPersonnelDetailPage } from './components/IctPersonnelDetailPage.svelte';
export { default as PersonnelCriticalTaskReadinessTable } from './components/PersonnelCriticalTaskReadinessTable.svelte';
export { default as PersonnelCriticalTaskDrawer } from './components/PersonnelCriticalTaskDrawer.svelte';

export { createIctTaskImportLane } from './import/ictTaskImportLane';
export { createIctCompletionImportLane, type IctCompletionImportColumns } from './import/ictCompletionImportLane';
export { ictTasksStore } from './stores/ictTasks.svelte';
export { personnelIctCompletionsStore } from './stores/personnelIctCompletions.svelte';
export {
	criticalTasksConfigureLibraryAffordance,
	criticalTasksRecordCompletionAffordance,
	criticalTasksViewReadinessAffordance
} from './utils/criticalTasksPolicy';
export { criticalTasksSettingsFromWorkspaceData } from './utils/criticalTasksWorkspaceData';
export { normalizeCriticalTasksSettings } from './utils/ictStatus';
export { getActiveIctTasksForLibrary } from './utils/ictTaskLibrary';
export {
	criticalTasksWorkspaceHydrator,
	criticalTasksWorkspaceStatus,
	resetCriticalTasksWorkspaceStatus,
	markCriticalTasksWorkspacePending,
	markCriticalTasksWorkspaceRejected,
	markCriticalTasksWorkspaceResolved
} from './criticalTasksWorkspaceHydration.svelte';
export type { IctTask, PersonnelIctCompletion } from './criticalTasks.types';

export type { CriticalTasksPageAccess } from './contracts';
