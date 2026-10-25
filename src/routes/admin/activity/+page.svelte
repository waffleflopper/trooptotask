<script lang="ts">
	import { page } from '$app/state';
	import ActivityView from '$features/platform-admin/components/ActivityView.svelte';
	import { fetchActivity } from '$features/platform-admin/components/fetchActivity';
	import { parseActivityQuery } from '$features/platform-admin/activityQuery';

	const query = $derived(parseActivityQuery(page.url.searchParams));
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
</script>

<svelte:head>
	<title>Activity - Admin - Troop to Task</title>
</svelte:head>

<ActivityView {query} {timeZone} load={fetchActivity} />
