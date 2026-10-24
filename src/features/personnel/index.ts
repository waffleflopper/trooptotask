export { personnelStore, rosterStore, personnelRosterHydration, createPersonnel } from './stores/personnel.svelte';
export type { RosterReadStore } from './stores/personnel.svelte';
export { groupsStore, groupCatalogHydration } from './stores/groups.svelte';
export { pinnedGroupsStore, pinnedGroupsHydration } from './stores/pinnedGroups.svelte';

export { PersonnelPageContext } from './contexts/PersonnelPageContext.svelte';
export type { PersonnelPageData } from './contexts/PersonnelPageContext.svelte';
export { RosterSignals } from './rosterSignals.svelte';

export type { RequestPersonnelArchiveApproval } from './utils/archivePersonnel';
export { acknowledgeAwardTracking } from './utils/awardTracking';

/** Keep the roster's dialogs lazy while exposing their consumed Web entry. */
export function loadPersonnelModals() {
	return import('./components/PersonnelModals.svelte');
}

export { personnelWorkspaceHydrator } from './personnelWorkspaceHydration.svelte';
export { provideDataSheetEditSession } from './workspace/dataSheetEditSession.svelte';
export { createPersonnelImportLane } from './import/personnelImportLane';
export { lastFirstSplitter } from './import/personnelImportColumns';
export { rosterPersonReference } from './import/personMatching';
export { readinessDrawerFromSearch } from './readinessDrawerTarget';
export { alsoChecked, attentionRows, uncheckedSources } from './personnelAttentionView';
export type { ReadinessDrawerTarget } from './readinessDrawerTarget';

export type { PersonnelPageAccess } from './contracts';
