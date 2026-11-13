<script lang="ts">
	import { RatingSchemePageContext, RatingSchemePageView, loadRatingSchemeModals } from '$features/rating-scheme';
	import type { RatingSchemePageData } from '$features/rating-scheme';
	import { submitDeletionRequest } from '$features/deletion-requests';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import type { RatingSchemeWorkspaceResult } from '$features/rating-scheme/contracts';
	import EvalsWorkspace from './EvalsWorkspace.svelte';

	let { data } = $props();

	const org = getAppShellContext();
	const modals = new ModalRegistry();

	function createPageData(workspace: RatingSchemeWorkspaceResult): RatingSchemePageData {
		return {
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			personnelLookup: workspace.data.personnelLookup
		};
	}
</script>

<svelte:head>
	<title>Evals - Troop to Task</title>
</svelte:head>

<EvalsWorkspace {data}>
	{#snippet children(workspace)}
		{@const ctx = new RatingSchemePageContext(createPageData(workspace), modals, org)}
		{@const personnelLookup = workspace.data.personnelLookup}
		<RatingSchemePageView {ctx} {personnelLookup} />
		{#await loadRatingSchemeModals() then { default: RatingSchemeModals }}
			<RatingSchemeModals
				{modals}
				{personnelLookup}
				orgId={ctx.orgId}
				onRequestDeletion={(id, description, isCurrent) =>
					submitDeletionRequest(ctx.orgId, 'evaluation', id, description, `/org/${ctx.orgId}/evals`, isCurrent)}
			/>
		{/await}
	{/snippet}
</EvalsWorkspace>
