<script lang="ts">
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';

	let { children, data } = $props();

	// Guard against parent-only invalidation clobbering optimistic store mutations.
	// See calendar/+layout.svelte for full explanation.
	let lastRefs: unknown[] = [];

	$effect(() => {
		const refs = [data.personnelTrainings, data.orgId];

		const unchanged = refs.length === lastRefs.length && refs.every((r, i) => r === lastRefs[i]);
		if (unchanged) return;
		lastRefs = refs;

		personnelTrainingsStore.load(data.personnelTrainings ?? [], data.orgId);
	});
</script>

{@render children()}
