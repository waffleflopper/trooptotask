<script lang="ts">
	import { orgShellHydrationCoordinator } from '$lib/orgShellHydrationCoordinator.svelte';

	const coordinator = orgShellHydrationCoordinator;

	let { children, data } = $props();

	$effect(() => {
		void coordinator.hydrate(data.calendar?.hydration);
	});
</script>

{@render children()}
