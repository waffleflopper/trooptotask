<script lang="ts">
	import { orgShellHydrationCoordinator } from '$lib/orgShellHydrationCoordinator.svelte';

	const coordinator = orgShellHydrationCoordinator;

	let { children, data } = $props();

	$effect(() => {
		void coordinator.hydrate(data.dashboard?.hydration);
	});
</script>

{@render children()}
