// Personnel feature barrel export

// Stores
export { personnelStore } from './stores/personnel.svelte';

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
