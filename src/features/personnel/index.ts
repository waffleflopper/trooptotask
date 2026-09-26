// Personnel feature barrel export

// Stores
export { personnelStore, rosterStore, personnelRosterHydration } from './stores/personnel.svelte';
export type { RosterReadStore } from './stores/personnel.svelte';
export { groupsStore, groupCatalogHydration } from './stores/groups.svelte';

// Context
export { PersonnelPageContext } from './contexts/PersonnelPageContext.svelte';
export type { PersonnelPageData } from './contexts/PersonnelPageContext.svelte';

// Components are imported directly from their paths:
// $features/personnel/components/PersonnelModal.svelte
// $features/personnel/components/PersonnelPageView.svelte
// $features/personnel/components/PersonnelModals.svelte
// PersonnelRow moved to $features/calendar/components/CalendarRow.svelte
// $features/personnel/components/PersonnelImportPage.svelte
// $features/personnel/components/ExtendedInfoModal.svelte
