<script lang="ts">
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { RatingSchemePageContext } from '$features/rating-scheme/contexts/RatingSchemePageContext.svelte';
	import type { RatingSchemePageData } from '$features/rating-scheme/contexts/RatingSchemePageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import RatingSchemePageView from '$features/rating-scheme/components/RatingSchemePageView.svelte';
	import RatingSchemeModals from '$features/rating-scheme/components/RatingSchemeModals.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const workspaceData = $derived(data.ratingScheme.data);

	const pageData = $derived.by(
		(): RatingSchemePageData => ({
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			ratingSchemeEntries: workspaceData.ratingSchemeEntries,
			lossWarningWindowDays: workspaceData.lossWarningWindowDays
		})
	);

	const ctx = $derived(new RatingSchemePageContext(pageData, modals, org, ratingSchemeStore));
	const personnelLookup = $derived(workspaceData.personnelLookup);
</script>

<RatingSchemePageView {ctx} {personnelLookup} />
<RatingSchemeModals {ctx} {modals} {personnelLookup} />
