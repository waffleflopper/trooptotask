<script lang="ts">
	import { orgShellCoordinator } from '$lib/orgShellCoordinator.svelte';

	const coordinator = orgShellCoordinator;

	let { children, data } = $props();

	$effect(() => {
		void coordinator.hydrate(data.dashboard?.hydration);
	});
</script>

{@render children()}
