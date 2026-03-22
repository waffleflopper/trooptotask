<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { PersonnelPageData } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import PersonnelPageView from '$features/personnel/components/PersonnelPageView.svelte';

	let { data } = $props();

	// Hydrate personnel-specific stores (universal stores hydrated in org layout)
	$effect(() => {
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
		ratingSchemeStore.load(data.ratingSchemeEntries, data.orgId);
	});

	// Context is created once per page mount. The stores passed in are module
	// singletons — their reactive `.list` getters are read inside the context's
	// derived getters, so all computations stay live without recreating the context.
	// Cast: SvelteKit page data is a superset of PersonnelPageData.
	const ctx = new PersonnelPageContext(data as PersonnelPageData, personnelStore, ratingSchemeStore, pinnedGroupsStore);
</script>

<PersonnelPageView {ctx} allPersonnel={data.personnel ?? []} permissions={data.permissions} />
