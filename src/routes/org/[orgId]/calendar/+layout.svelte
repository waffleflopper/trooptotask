<script lang="ts">
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { dutyRosterHistoryStore } from '$features/duty-roster/stores/dutyRosterHistory.svelte';

	let { children, data } = $props();

	// Guard against parent-only invalidation re-running this effect.
	// When invalidate('app:org-core') fires on tab focus, SvelteKit re-runs the
	// parent layout server but NOT the calendar layout server (different depends key).
	// However, the merged `data` prop gets a new object reference, causing this
	// $effect to re-run and call load() with stale calendar data — clobbering
	// optimistic mutations the user made while the tab was active.
	// Fix: track the actual data array references and skip if unchanged.
	// Using untracked plain variable to avoid creating a circular dependency.
	let lastRefs: unknown[] = [];

	$effect(() => {
		const refs = [
			data.availabilityEntries,
			data.dailyAssignments,
			data.specialDays,
			data.assignmentTypes,
			data.rosterHistory,
			data.pinnedGroups,
			data.orgId
		];

		const unchanged = refs.length === lastRefs.length && refs.every((r, i) => r === lastRefs[i]);
		if (unchanged) return;
		lastRefs = refs;

		availabilityStore.load(data.availabilityEntries, data.orgId);
		specialDaysStore.load(data.specialDays, data.orgId);
		dailyAssignmentsStore.load(data.assignmentTypes, data.dailyAssignments, data.orgId);
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
		dutyRosterHistoryStore.load(data.rosterHistory);
	});
</script>

{@render children()}
