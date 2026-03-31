<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';

	let { children, data } = $props();

	$effect(() => {
		pinnedGroupsStore.load(data.training.data.pinnedGroups ?? [], data.orgId);
		applyHydration(data.training?.hydration);
	});
</script>

{@render children()}
