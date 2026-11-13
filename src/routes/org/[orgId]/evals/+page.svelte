<script lang="ts">
	import {
		EvalTrackerContext,
		EvalTrackerView,
		EvalTrackerViewState,
		loadEvalTrackerModals
	} from '$features/rating-scheme';
	import { submitDeletionRequest } from '$features/deletion-requests';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import EvalsWorkspace from './EvalsWorkspace.svelte';

	let { data } = $props();

	const org = getAppShellContext();
	const modals = new ModalRegistry();
	const orgId = $derived(data.shell.org.id);
	const view = $derived(new EvalTrackerViewState(orgId));
</script>

<svelte:head>
	<title>Evals - Troop to Task</title>
</svelte:head>

<EvalsWorkspace {data} skeleton="tracker">
	{#snippet children(workspace)}
		{@const personnelLookup = workspace.data.personnelLookup}
		{@const ctx = new EvalTrackerContext(
			{ orgId: data.shell.org.id, orgName: data.shell.org.name, personnelLookup },
			modals,
			org,
			view
		)}
		<EvalTrackerView {ctx} />
		{#await loadEvalTrackerModals() then { default: EvalTrackerModals }}
			<EvalTrackerModals
				{modals}
				{personnelLookup}
				orgId={ctx.orgId}
				onRequestDeletion={(id, description, isCurrent) =>
					submitDeletionRequest(ctx.orgId, 'evaluation', id, description, `/org/${ctx.orgId}/evals`, isCurrent)}
			/>
		{/await}
	{/snippet}
</EvalsWorkspace>
