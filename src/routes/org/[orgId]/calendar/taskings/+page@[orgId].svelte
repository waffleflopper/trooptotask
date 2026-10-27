<script lang="ts">
	import { page } from '$app/state';
	import TaskingsPage from '$features/calendar/taskings/components/TaskingsPage.svelte';
	import { parseTaskingFilters } from '$features/calendar';
	import { getAppShellContext } from '$features/app-shell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const org = getAppShellContext();
	const filters = $derived(parseTaskingFilters(page.url.searchParams));
</script>

<svelte:head>
	<title>Taskings - Troop to Task</title>
</svelte:head>

<TaskingsPage
	{org}
	today={data.today}
	{filters}
	list={data.list}
	workspace={data.workspace}
	choices={data.choices}
	eventMembers={data.eventMembers}
/>
