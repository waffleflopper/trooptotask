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

// Other components are imported directly from their paths:
// $features/personnel/components/PersonnelPageView.svelte
// $features/personnel/components/PersonnelDetailPageView.svelte
// PersonnelRow moved to $features/calendar/components/CalendarRow.svelte
// $features/personnel/components/PersonnelImportPage.svelte
// $features/personnel/components/ExtendedInfoModal.svelte
