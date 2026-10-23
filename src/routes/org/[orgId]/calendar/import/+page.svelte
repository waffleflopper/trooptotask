<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import StatusImportPage from '$features/calendar/components/StatusImportPage.svelte';

	let { data } = $props();

	const org = getAppShellContext();
</script>

<svelte:head>
	<title>Import statuses - Troop to Task</title>
</svelte:head>

{#key data.shell.org.id}
	<StatusImportPage {org} orgId={data.shell.org.id} orgName={data.shell.org.name} />
{/key}
