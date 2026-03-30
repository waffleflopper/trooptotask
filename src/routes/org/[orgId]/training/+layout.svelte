<script lang="ts">
	import { applyHydration } from '$lib/applyHydration.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';

	let { children, data } = $props();

	$effect(() => {
		const { data: trainingData, hydration } = data.training;
		const orgId = data.orgId;
		let cancelled = false;

		applyHydration(hydration);

		personnelTrainingsStore.startLoading();

		trainingData.personnelTrainings
			.then((items) => {
				if (cancelled) return;
				personnelTrainingsStore.load(items ?? [], orgId);
			})
			.catch(() => {
				if (cancelled) return;
				personnelTrainingsStore.load([], orgId);
			});

		return () => {
			cancelled = true;
		};
	});
</script>

{@render children()}
