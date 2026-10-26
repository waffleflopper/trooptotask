<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import TaskingDetailPage from '$features/calendar/taskings/components/TaskingDetailPage.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const org = getAppShellContext();
	const edit = page.url.searchParams.has('edit');

	// The request to edit is spent on arrival, so Back or a reload never reopens the dialog.
	onMount(() => {
		if (!edit) return;
		const url = new URL(page.url);
		url.searchParams.delete('edit');
		replaceState(url, page.state);
	});
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
		availabilityGaps={data.availabilityGaps}
		editOnArrival={edit}
	/>
{/key}
