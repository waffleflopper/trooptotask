<script lang="ts">
	import {
		PersonnelPageView,
		rosterStore,
		pinnedGroupsStore,
		loadPersonnelModals,
		PersonnelPageContext,
		type PersonnelPageData
	} from '$features/personnel';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
	import type { PersonnelWorkspaceData, PersonnelWorkspaceResult } from '$features/personnel/contracts';

	import { requestPersonnelArchiveApproval as requestArchiveApproval } from '$lib/personnelArchiveRequestDelivery';

	let { data } = $props();

	let resolvedSnapshot = $state<{ orgId: string; workspace: PersonnelWorkspaceResult } | null>(null);
	let loadError = $state<{ orgId: string; error: Error } | null>(null);
	const streamedWorkspace = $derived(data.personnel.data);
	const workspace = $derived(
		!isPromiseLike(streamedWorkspace)
			? streamedWorkspace
			: resolvedSnapshot && resolvedSnapshot.orgId === data.shell.org.id
				? resolvedSnapshot.workspace
				: null
	);

	$effect(() => {
		const orgId = data.shell.org.id;
		const pending = streamedWorkspace;
		let cancelled = false;
		loadError = null;
		if (!isPromiseLike(pending)) {
			resolvedSnapshot = { orgId, workspace: pending };
			return;
		}
		void observeDeferred(pending, {
			fallbackMessage: 'Failed to load personnel workspace',
			onResolve: (workspace) => {
				resolvedSnapshot = { orgId, workspace };
			},
			onReject: (error) => {
				loadError = { orgId, error };
			},
			isCancelled: () => cancelled
		});
		return () => {
			cancelled = true;
		};
	});

	const org = getAppShellContext();
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
		return new PersonnelPageContext(createPageData(workspaceData), modals, org, rosterStore, pinnedGroupsStore);
	}
</script>

{#key data.shell.org.id}
	{#if loadError && loadError.orgId === data.shell.org.id && !workspace}
		<!-- The Personnel layout observes this same source and shows WorkspaceLoadError. -->
	{:else if workspace}
		{@const ctx = createContext(workspace.data)}
		<PersonnelPageView {ctx} {requestArchiveApproval} />
		{#await loadPersonnelModals() then { default: PersonnelModals }}
			<PersonnelModals {ctx} {modals} {requestArchiveApproval} />
		{/await}
	{:else}
		<div class="px-6 py-8">
			<div class="h-8 w-48 animate-pulse rounded bg-muted"></div>
			<div class="mt-6 h-80 animate-pulse rounded border bg-muted/40"></div>
		</div>
	{/if}
{/key}
