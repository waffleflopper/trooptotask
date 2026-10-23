<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { createIctTaskImportLane, ictTasksStore } from '$features/critical-tasks';
	import { ImportFlow } from '$lib/components/patterns/import-flow';

	const org = getAppShellContext();

	const ready = $derived(ictTasksStore.orgId === org.orgId && !ictTasksStore.loading);
	const lane = $derived(
		ready ? createIctTaskImportLane({ orgUrlSegment: org.orgUrlSegment, tasks: ictTasksStore.items }) : null
	);
</script>

<svelte:head>
	<title>Import critical tasks - Troop to Task</title>
</svelte:head>

{#key org.orgId}
	<ImportFlow {lane} title="Import tasks" eyebrow="Critical Tasks · Task library" />
{/key}
