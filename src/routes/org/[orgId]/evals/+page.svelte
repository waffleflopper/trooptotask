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
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const workspaceData = $derived(data.ratingScheme.data);

	const pageData = $derived.by(
		(): RatingSchemePageData => ({
			orgId: shell?.org.id ?? '',
			orgName: shell?.org.name ?? '',
			ratingSchemeEntries: workspaceData.ratingSchemeEntries,
			permissions: shell?.member.permissions,
			lossWarningWindowDays: workspaceData.lossWarningWindowDays
		})
	);

	const ctx = $derived(new RatingSchemePageContext(pageData, modals, org, ratingSchemeStore));
</script>

<RatingSchemePageView {ctx} personnelLookup={workspaceData.personnelLookup} />
<RatingSchemeModals {ctx} {modals} personnelLookup={workspaceData.personnelLookup} />
