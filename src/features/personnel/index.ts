// Personnel feature barrel export

// Stores
export { personnelStore } from './stores/personnel.svelte';
// Utils
export {
	groupAndSortPersonnel,
	RANK_ORDER,
	type PersonnelGroup,
	type GroupSortOptions
} from './utils/personnelGrouping';

// Components are imported directly from their paths:
// $features/personnel/components/PersonnelModal.svelte
// PersonnelRow moved to $features/calendar/components/CalendarRow.svelte
// $features/personnel/components/BulkPersonnelManager.svelte
// $features/personnel/components/ExtendedInfoModal.svelte
