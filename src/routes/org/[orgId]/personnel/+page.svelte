<script lang="ts">
	import {
		PersonnelPageView,
		rosterStore,
		pinnedGroupsStore,
		groupsStore,
		loadPersonnelModals,
		PersonnelPageContext,
		PersonnelRosterSkeleton,
		RosterSignals,
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
	const signals = new RosterSignals();

	$effect(() => {
		signals.observe(data.shell.org.id, data.asOf, data.rosterSignals);
	});

	function createPageData(workspaceData: PersonnelWorkspaceData): PersonnelPageData {
		return {
			orgId: data.shell.org.id,
			asOf: data.asOf,
			orgName: data.shell.org.name,
			pinnedGroups: workspaceData.pinnedGroups,
			rankCatalog: workspaceData.rankCatalog,
			personnel: workspaceData.personnel,
			lossWarningWindowDays: workspaceData.lossWarningWindowDays,
			awardTrackingAcknowledgedPersonnelIds: workspaceData.awardTrackingAcknowledgedPersonnelIds,
			disabledFeatures: data.shell.kind === 'ready' ? data.shell.org.disabledFeatures : []
		};
	}

	function createContext(workspaceData: PersonnelWorkspaceData): PersonnelPageContext {
		return new PersonnelPageContext(
			createPageData(workspaceData),
			modals,
			org,
			rosterStore,
			pinnedGroupsStore,
			signals,
			groupsStore
		);
	}
</script>

{#key data.shell.org.id}
	{#if loadError && loadError.orgId === data.shell.org.id && !workspace}
		<!-- The Personnel layout observes this same source and shows WorkspaceLoadError. -->
	{:else if workspace}
		{@const ctx = createContext(workspace.data)}
		<PersonnelPageView {ctx} />
		{#await loadPersonnelModals() then { default: PersonnelModals }}
			<PersonnelModals {ctx} {modals} {requestArchiveApproval} />
		{/await}
	{:else}
		<PersonnelRosterSkeleton />
	{/if}
{/key}
