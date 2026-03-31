<script lang="ts">
	import AssignmentPlannerPage from '$features/calendar/components/AssignmentPlannerPage.svelte';

	let { data } = $props();

	const pageData = $derived.by(() => ({
		orgId: data.orgId,
		orgName: data.orgName,
		calendar: data.calendar ? { data: data.calendar.data } : undefined,
		scopedGroupId: data.scopedGroupId,
		permissions: data.permissions
	}));
</script>

<svelte:head>
	<title>Assignment Planner - Troop to Task</title>
</svelte:head>

<AssignmentPlannerPage data={pageData} />
