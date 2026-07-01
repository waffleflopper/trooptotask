<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { PersonnelPageData } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import PersonnelPageView from '$features/personnel/components/PersonnelPageView.svelte';
	import type { PersonnelWorkspaceData } from '$features/personnel/server/personnelWorkspaceBootstrap';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();

	function createPageData(workspaceData: PersonnelWorkspaceData): PersonnelPageData {
		return {
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			pinnedGroups: workspaceData.pinnedGroups,
			rankCatalog: workspaceData.rankCatalog,
			personnel: workspaceData.personnel,
			lossWarningWindowDays: workspaceData.lossWarningWindowDays,
			awardTrackingAcknowledgedPersonnelIds: workspaceData.awardTrackingAcknowledgedPersonnelIds
		};
	}

	function createContext(workspaceData: PersonnelWorkspaceData): PersonnelPageContext {
		return new PersonnelPageContext(createPageData(workspaceData), modals, org, personnelStore, pinnedGroupsStore);
	}
</script>

{#await data.personnel.data}
	<div class="px-6 py-8">
		<div class="h-8 w-48 animate-pulse rounded bg-muted"></div>
		<div class="mt-6 h-80 animate-pulse rounded border bg-muted/40"></div>
	</div>
{:then personnelWorkspace}
	{@const ctx = createContext(personnelWorkspace.data)}
	<PersonnelPageView {ctx} />
	{#await import('$features/personnel/components/PersonnelModals.svelte') then { default: PersonnelModals }}
		<PersonnelModals {ctx} {modals} />
	{/await}
{:catch error}
	{throwRenderError(error, 'Failed to load personnel workspace')}
{/await}
