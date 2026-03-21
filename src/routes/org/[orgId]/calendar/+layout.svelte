<script lang="ts">
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { dutyRosterHistoryStore } from '$features/duty-roster/stores/dutyRosterHistory.svelte';

	let { children, data } = $props();

	// Hydrate calendar-specific stores
	$effect(() => {
		availabilityStore.load(data.availabilityEntries, data.orgId);
		specialDaysStore.load(data.specialDays, data.orgId);
		dailyAssignmentsStore.load(data.assignmentTypes, data.dailyAssignments, data.orgId);
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
		dutyRosterHistoryStore.load(data.rosterHistory);
	});
</script>

{@render children()}
