<script lang="ts">
	import { page } from '$app/state';
	import { takeOneTimeParam } from '$lib/utils/addressWriter';
	import EventDetailPage from '$features/calendar/events/components/EventDetailPage.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const org = getAppShellContext();
	const addTasking = takeOneTimeParam('addTasking') !== null;
</script>

<svelte:head>
	<title>Event - Troop to Task</title>
</svelte:head>

{#key page.params.eventId}
	<EventDetailPage
		{org}
		today={data.today}
		detail={data.detail}
		activity={data.activity}
		taskings={data.taskings}
		workspace={data.workspace}
		taskingSummaries={data.taskingSummaries}
		taskingChoices={data.taskingChoices}
		{addTasking}
	/>
{/key}
