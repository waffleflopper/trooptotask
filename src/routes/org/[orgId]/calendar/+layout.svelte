<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';

	let { children, data } = $props();

	$effect(() => {
		applyHydration(data.calendar?.hydration);
	});
</script>

{@render children()}
