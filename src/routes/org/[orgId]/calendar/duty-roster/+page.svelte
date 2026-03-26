<script lang="ts">
	import DutyRosterPage from '$features/duty-roster/components/DutyRosterPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Duty Roster - Troop to Task</title>
</svelte:head>

<DutyRosterPage {data} />
