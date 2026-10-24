export { personnelStore, rosterStore, personnelRosterHydration, createPersonnel } from './stores/personnel.svelte';
export type { RosterReadStore } from './stores/personnel.svelte';
export { groupsStore, groupCatalogHydration } from './stores/groups.svelte';
export { pinnedGroupsStore, pinnedGroupsHydration } from './stores/pinnedGroups.svelte';

export { PersonnelPageContext } from './contexts/PersonnelPageContext.svelte';
export type { PersonnelPageData } from './contexts/PersonnelPageContext.svelte';
export { RosterSignals } from './rosterSignals.svelte';

export { default as PersonnelModal } from './components/PersonnelModal.svelte';
export type { RequestPersonnelArchiveApproval } from './utils/archivePersonnel';
export { acknowledgeAwardTracking } from './utils/awardTracking';

/** Keep the roster's dialogs lazy while exposing their consumed Web entry. */
export function loadPersonnelModals() {
	return import('./components/PersonnelModals.svelte');
}

export { default as PersonnelPageView } from './components/PersonnelPageView.svelte';
export { default as PersonnelRosterSkeleton } from './components/roster/PersonnelRosterSkeleton.svelte';
export { personnelWorkspaceHydrator } from './personnelWorkspaceHydration.svelte';
export { default as PersonnelDataSheetPageView } from './components/PersonnelDataSheetPageView.svelte';
export { provideDataSheetEditSession } from './workspace/dataSheetEditSession.svelte';
export { default as PersonnelRecordHeader } from './components/PersonnelRecordHeader.svelte';
export { createPersonnelImportLane } from './import/personnelImportLane';
export { lastFirstSplitter } from './import/personnelImportColumns';
export { rosterPersonReference } from './import/personMatching';
export { default as PersonnelLogPageView } from './components/PersonnelLogPageView.svelte';
export { default as PersonnelFilesPageView } from './components/PersonnelFilesPageView.svelte';
export { default as PersonnelOpenFollowUps } from './components/PersonnelOpenFollowUps.svelte';
export { default as PersonnelArchivedPageView } from './components/PersonnelArchivedPageView.svelte';
export { default as PersonnelLossBlock } from './components/PersonnelLossBlock.svelte';
export { readinessDrawerFromSearch } from './readinessDrawerTarget';
export { alsoChecked, attentionRows, uncheckedSources } from './personnelAttentionView';
export type { ReadinessDrawerTarget } from './readinessDrawerTarget';

export type { PersonnelPageAccess } from './contracts';
