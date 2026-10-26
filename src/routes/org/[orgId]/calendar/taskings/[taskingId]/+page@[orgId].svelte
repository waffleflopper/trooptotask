<script lang="ts">
	import { page } from '$app/state';
	import TaskingDetailPage from '$features/calendar/taskings/components/TaskingDetailPage.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const org = getAppShellContext();
</script>

<svelte:head>
	<title>Tasking - Troop to Task</title>
</svelte:head>

{#key page.params.taskingId}
	<TaskingDetailPage {org} today={data.today} detail={data.detail} activity={data.activity} choices={data.choices} />
{/key}
