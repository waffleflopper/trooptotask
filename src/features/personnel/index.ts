// Personnel feature barrel export

// Stores
export { personnelStore, rosterStore, personnelRosterHydration, createPersonnel } from './stores/personnel.svelte';
export type { RosterReadStore } from './stores/personnel.svelte';
export { groupsStore, groupCatalogHydration } from './stores/groups.svelte';
export { pinnedGroupsStore, pinnedGroupsHydration } from './stores/pinnedGroups.svelte';

// Context
export { PersonnelPageContext } from './contexts/PersonnelPageContext.svelte';
export type { PersonnelPageData } from './contexts/PersonnelPageContext.svelte';

// Consumed Web creation form for Onboarding.
export { default as PersonnelModal } from './components/PersonnelModal.svelte';
export type { RequestPersonnelArchiveApproval } from './utils/archivePersonnel';

/** Keep the roster's dialogs lazy while exposing their consumed Web entry. */
export function loadPersonnelModals() {
	return import('./components/PersonnelModals.svelte');
}

export { default as PersonnelPageView } from './components/PersonnelPageView.svelte';
export { personnelWorkspaceHydrator } from './personnelWorkspaceHydration.svelte';
export { default as PersonnelDataSheetPageView } from './components/PersonnelDataSheetPageView.svelte';
export { provideDataSheetEditSession } from './workspace/dataSheetEditSession.svelte';
export { default as PersonnelRecordHeader } from './components/PersonnelRecordHeader.svelte';
export { default as PersonnelImportPage } from './components/PersonnelImportPage.svelte';
export { default as PersonnelFollowUpsPageView } from './components/PersonnelFollowUpsPageView.svelte';
export { default as PersonnelCounselingsPageView } from './components/PersonnelCounselingsPageView.svelte';
export { default as PersonnelDocumentsPageView } from './components/PersonnelDocumentsPageView.svelte';
export { default as PersonnelNotesPageView } from './components/PersonnelNotesPageView.svelte';
export { default as PersonnelArchivedArtifactsPageView } from './components/PersonnelArchivedArtifactsPageView.svelte';
export { default as PersonnelLossBlock } from './components/PersonnelLossBlock.svelte';
export { attentionTargetHref, readinessDrawerFromSearch } from './readinessDrawerTarget';
export { alsoChecked, attentionRows, uncheckedSources } from './personnelAttentionView';
export type { ReadinessDrawerTarget, ReadinessItemKind } from './readinessDrawerTarget';

export type { PersonnelPageAccess } from './contracts';
