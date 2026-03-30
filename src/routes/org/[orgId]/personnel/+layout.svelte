<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';

	let { children, data } = $props();

	$effect(() => {
		applyHydration(data.personnel.hydration);
	});
</script>

{@render children()}
