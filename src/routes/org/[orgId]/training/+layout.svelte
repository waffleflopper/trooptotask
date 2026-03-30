<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';

	let { children, data } = $props();

	// Track the promise reference to guard against parent-only invalidation
	// clobbering optimistic store mutations.
	// See calendar/+layout.svelte for full explanation.
	let lastPromiseRef: unknown = null;

	$effect(() => {
		const { data: trainingData, hydration } = data.training;
		const orgId = data.orgId;

		applyHydration(hydration);

		const promiseRef = trainingData.personnelTrainings;

		if (promiseRef === lastPromiseRef) return;
		lastPromiseRef = promiseRef;

		// Signal loading immediately so skeletons show during navigation
		personnelTrainingsStore.startLoading();

		// Hydrate store when deferred data arrives
		promiseRef
			.then((items) => {
				personnelTrainingsStore.load(items ?? [], orgId);
			})
			.catch(() => {
				personnelTrainingsStore.load([], orgId);
			});
	});
</script>

{@render children()}
