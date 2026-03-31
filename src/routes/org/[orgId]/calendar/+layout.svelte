<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';

	let { children, data } = $props();

	$effect(() => {
		pinnedGroupsStore.load(data.calendar.data.pinnedGroups ?? [], data.orgId);
		applyHydration(data.calendar?.hydration);
	});
</script>

{@render children()}
