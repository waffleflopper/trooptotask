<script lang="ts">
	import TrainingTypesPage from '$features/training/components/TrainingTypesPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Training Types - Troop to Task</title>
</svelte:head>

<TrainingTypesPage {data} />
