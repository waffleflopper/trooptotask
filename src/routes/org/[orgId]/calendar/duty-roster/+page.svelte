<script lang="ts">
	import DutyRosterPage from '$features/duty-roster/components/DutyRosterPage.svelte';

	let { data } = $props();

	const pageData = $derived.by(() => ({
		orgId: data.orgId,
		orgName: data.orgName,
		calendar: data.calendar ? { data: data.calendar.data } : undefined,
		scopedGroupId: data.scopedGroupId,
		rosterHistory: data.rosterHistory
	}));
</script>

<svelte:head>
	<title>Duty Roster - Troop to Task</title>
</svelte:head>

<DutyRosterPage data={pageData} />
