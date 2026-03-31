<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';

	let { children, data } = $props();

	$effect(() => {
		applyHydration(data.onboarding?.hydration);
	});
</script>

{@render children()}
