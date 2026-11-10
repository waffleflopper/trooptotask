<script lang="ts">
	import { page } from '$app/state';
	import { takeOneTimeParam } from '$lib/utils/addressWriter';
	import TaskingDetailPage from '$features/calendar/taskings/components/TaskingDetailPage.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const org = getAppShellContext();
	const edit = takeOneTimeParam('edit') !== null;
</script>

<svelte:head>
	<title>Tasking - Troop to Task</title>
</svelte:head>

{#key page.params.taskingId}
	<TaskingDetailPage
		{org}
		today={data.today}
		detail={data.detail}
		activity={data.activity}
		lists={data.lists}
		choices={data.choices}
		people={data.people}
		pickStates={data.pickStates}
		restOfEvent={data.restOfEvent}
		availabilityGaps={data.availabilityGaps}
		editOnArrival={edit}
	/>
{/key}
