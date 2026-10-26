<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import EventDetailPage from '$features/calendar/events/components/EventDetailPage.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const org = getAppShellContext();
	const addTasking = page.url.searchParams.has('addTasking');

	// The request to add a tasking is spent on arrival, so Back or a reload never reopens the dialog.
	onMount(() => {
		if (!addTasking) return;
		const url = new URL(page.url);
		url.searchParams.delete('addTasking');
		replaceState(url, page.state);
	});
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
		taskingSummaries={data.taskingSummaries}
		taskingChoices={data.taskingChoices}
		{addTasking}
	/>
{/key}
