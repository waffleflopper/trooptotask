<script lang="ts">
	import {
		RatingSchemeLinesContext,
		RatingSchemeLinesView,
		loadRatingSchemeLinesModals
	} from '$features/rating-scheme';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import EvalsWorkspace from '../EvalsWorkspace.svelte';

	let { data } = $props();

	const org = getAppShellContext();
	const modals = new ModalRegistry();
</script>

<svelte:head>
	<title>Evals - Troop to Task</title>
</svelte:head>

<EvalsWorkspace {data}>
	{#snippet children(workspace)}
		{@const personnelLookup = workspace.data.personnelLookup}
		{@const ctx = new RatingSchemeLinesContext(
			{ orgId: data.shell.org.id, orgName: data.shell.org.name, personnelLookup },
			modals,
			org
		)}
		<RatingSchemeLinesView {ctx} />
		{#await loadRatingSchemeLinesModals() then { default: RatingSchemeLinesModals }}
			<RatingSchemeLinesModals {modals} {personnelLookup} orgId={ctx.orgId} listedPersonIds={ctx.listedPersonIds} />
		{/await}
	{/snippet}
</EvalsWorkspace>
