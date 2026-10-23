<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import CalendarSettingsPage from '$features/calendar/components/CalendarSettingsPage.svelte';

	let { data } = $props();
	const org = getAppShellContext();
</script>

<svelte:head>
	<title>Calendar Settings - Troop to Task</title>
</svelte:head>

<div class="mx-auto max-w-[1200px] px-6 py-4 pb-6">
	<CalendarSettingsPage {org} rankCatalog={data.rankCatalog.data} />
</div>
