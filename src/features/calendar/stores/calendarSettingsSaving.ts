import { dailyAssignmentsStore } from './dailyAssignments.svelte';
import { specialDaysStore } from './specialDays.svelte';
import { statusTypesStore } from './statusTypes.svelte';

/** A Calendar settings write is in flight: a status type or its order, an assignment type or its lanes, or a closure. */
export function calendarSettingsSaving(): boolean {
	return (
		statusTypesStore.busy || statusTypesStore.orderBusy || dailyAssignmentsStore.typesBusy || specialDaysStore.busy
	);
}
