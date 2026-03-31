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
	const workspaceData = $derived(data.personnel.data);
	const pageData = $derived.by(
		(): PersonnelPageData => ({
			orgId: data.orgId,
			orgName: data.orgName,
			pinnedGroups: workspaceData.pinnedGroups,
			ratingSchemeEntries: workspaceData.ratingSchemeEntries,
			personnel: workspaceData.personnel,
			permissions: data.permissions,
			scopedGroupId: data.scopedGroupId
		})
	);

	let ctx = $state(
		new PersonnelPageContext(pageData, modals, org, personnelStore, ratingSchemeStore, pinnedGroupsStore)
	);

	$effect.pre(() => {
		ctx = new PersonnelPageContext(pageData, modals, org, personnelStore, ratingSchemeStore, pinnedGroupsStore);
	});
</script>

<PersonnelPageView {ctx} allPersonnel={workspaceData.allPersonnel} permissions={data.permissions} />
<PersonnelModals {ctx} {modals} allPersonnel={workspaceData.allPersonnel} />
