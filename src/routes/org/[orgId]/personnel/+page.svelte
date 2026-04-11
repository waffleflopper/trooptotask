<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { PersonnelPageData } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import PersonnelPageView from '$features/personnel/components/PersonnelPageView.svelte';
	import PersonnelModals from '$features/personnel/components/PersonnelModals.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const workspaceData = $derived(data.personnel.data);

	function getPageViewFromUrl(): 'roster' | 'rating-scheme' {
		return page.url.searchParams.get('view') === 'rating-scheme' ? 'rating-scheme' : 'roster';
	}

	const pageData = $derived.by(
		(): PersonnelPageData => ({
			orgId: data.orgId,
			orgName: data.orgName,
			pinnedGroups: workspaceData.pinnedGroups,
			ratingSchemeEntries: workspaceData.ratingSchemeEntries,
			personnel: workspaceData.personnel,
			permissions: data.permissions,
			scopedGroupId: data.scopedGroupId,
			initialPageView: getPageViewFromUrl()
		})
	);

	const ctx = $derived(
		new PersonnelPageContext(pageData, modals, org, personnelStore, ratingSchemeStore, pinnedGroupsStore)
	);

	function setPageView(view: 'roster' | 'rating-scheme') {
		if (view === getPageViewFromUrl()) return;

		const url = new URL(page.url);
		if (view === 'rating-scheme') {
			url.searchParams.set('view', view);
		} else {
			url.searchParams.delete('view');
		}

		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}
</script>

<PersonnelPageView
	{ctx}
	personnelLookup={workspaceData.personnelLookup}
	permissions={data.permissions}
	onPageViewChange={setPageView}
/>
<PersonnelModals {ctx} {modals} personnelLookup={workspaceData.personnelLookup} />
