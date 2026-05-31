<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { PersonnelPageData } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import PersonnelPageView from '$features/personnel/components/PersonnelPageView.svelte';
	import PersonnelModals from '$features/personnel/components/PersonnelModals.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const workspaceData = $derived(data.personnel.data);

	const pageData = $derived.by(
		(): PersonnelPageData => ({
			orgId: shell?.org.id ?? '',
			orgName: shell?.org.name ?? '',
			pinnedGroups: workspaceData.pinnedGroups,
			personnel: workspaceData.personnel,
			permissions: shell?.member.permissions,
			lossWarningWindowDays: workspaceData.lossWarningWindowDays,
			awardTrackingAcknowledgedPersonnelIds: workspaceData.awardTrackingAcknowledgedPersonnelIds
		})
	);

	const ctx = $derived(new PersonnelPageContext(pageData, modals, org, personnelStore, pinnedGroupsStore));
</script>

<PersonnelPageView {ctx} permissions={shell?.member.permissions} />
<PersonnelModals {ctx} {modals} />
