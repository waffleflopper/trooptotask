<script lang="ts">
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';

	let { children, data } = $props();

	$effect(() => {
		personnelTrainingsStore.load(data.personnelTrainings ?? [], data.orgId);
	});
</script>

{@render children()}
