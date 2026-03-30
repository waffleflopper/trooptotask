<script lang="ts">
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
	const workspaceData = data.personnel.data;
	const pageData: PersonnelPageData = {
		orgId: data.orgId,
		orgName: data.orgName,
		pinnedGroups: data.pinnedGroups,
		ratingSchemeEntries: data.ratingSchemeEntries,
		personnel: workspaceData.personnel,
		permissions: data.permissions,
		scopedGroupId: data.scopedGroupId
	};

	// Hydrate personnel-specific stores (universal stores hydrated in org layout)
	$effect(() => {
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
		ratingSchemeStore.load(data.ratingSchemeEntries, data.orgId);
	});

	// Context is created once per page mount. The stores passed in are module
	// singletons — their reactive `.list` getters are read inside the context's
	// derived getters, so all computations stay live without recreating the context.
	// Cast: SvelteKit page data is a superset of PersonnelPageData.
	const ctx = new PersonnelPageContext(pageData, modals, org, personnelStore, ratingSchemeStore, pinnedGroupsStore);
</script>

<PersonnelPageView {ctx} allPersonnel={workspaceData.allPersonnel} permissions={data.permissions} />
<PersonnelModals {ctx} {modals} allPersonnel={workspaceData.allPersonnel} />
