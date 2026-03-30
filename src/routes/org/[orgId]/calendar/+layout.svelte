<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';

	let { children, data } = $props();

	$effect(() => {
		const { data: calData, hydration } = data.calendar;

		availabilityStore.load(calData.availabilityEntries, data.orgId);
		specialDaysStore.load(calData.specialDays, data.orgId);
		dailyAssignmentsStore.load(calData.assignmentTypes, calData.dailyAssignments, data.orgId);
		pinnedGroupsStore.load(calData.pinnedGroups, data.orgId);
		applyHydration(hydration);
	});
</script>

{@render children()}
