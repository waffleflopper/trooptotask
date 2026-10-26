<script lang="ts">
	import EventsPage from '$features/calendar/events/components/EventsPage.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const org = getAppShellContext();
</script>

<svelte:head>
	<title>Events - Troop to Task</title>
</svelte:head>

<EventsPage
	{org}
	today={data.today}
	when={data.when}
	list={data.list}
	taskings={data.taskings}
	choices={data.choices}
/>
