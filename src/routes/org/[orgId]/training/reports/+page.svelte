<script lang="ts">
	import TrainingReportsPage from '$features/training/components/TrainingReportsPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Training Reports - Troop to Task</title>
</svelte:head>

<TrainingReportsPage {data} />
