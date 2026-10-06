<script lang="ts">
	import { TrainingReportsPage } from '$features/training';
	import { getAppShellContext } from '$features/app-shell';

	let { data } = $props();
	const org = getAppShellContext();
</script>

<svelte:head>
	<title>Training Reports - Troop to Task</title>
</svelte:head>

{#key data.trainingReport}
	<TrainingReportsPage orgId={org.orgId} initialReport={data.trainingReport} />
{/key}
