<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	const org = getAppShellContext();
	import { CalendarSettingsPage } from '$features/calendar';
</script>

<svelte:head>
	<title>Calendar Settings - Troop to Task</title>
</svelte:head>

<div class="mx-auto max-w-[1200px] px-6 py-4 pb-6">
	<CalendarSettingsPage {org} />
</div>
