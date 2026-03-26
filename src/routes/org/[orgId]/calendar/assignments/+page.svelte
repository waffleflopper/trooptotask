<script lang="ts">
	import AssignmentPlannerPage from '$features/calendar/components/AssignmentPlannerPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Assignment Planner - Troop to Task</title>
</svelte:head>

<AssignmentPlannerPage {data} />
