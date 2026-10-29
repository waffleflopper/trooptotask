<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { createPersonnelImportLane, groupsStore, retainImportDodIds } from '$features/personnel';
	import type { PersonnelWorkspaceResult } from '$features/personnel/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { ImportFlow } from '$lib/components/patterns/import-flow';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
	import WorkspaceLoadError from '../../WorkspaceLoadError.svelte';

	let { data } = $props();

	const org = getAppShellContext();

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

	const importIds = retainImportDodIds(() => ({ orgId: data.shell.org.id, streamed: data.personnelImport }));

	const lane = $derived(
		workspace && importIds.current?.state === 'ready'
			? createPersonnelImportLane({
					orgId: org.orgId,
					orgUrlSegment: org.orgUrlSegment ?? org.orgId,
					personnel: workspace.data.personnel,
					dodIds: importIds.current.dodIds,
					groups: groupsStore.orgId === org.orgId ? groupsStore.items : workspace.data.groups,
					rankCatalog: workspace.data.rankCatalog,
					canManageGroups: org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.manageGroups).allowed,
					allowUnassigned: org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.importRecords, {
						kind: 'organization'
					}).allowed
				})
			: null
	);
</script>

{#key data.shell.org.id}
	{#if loadError?.orgId === data.shell.org.id && !workspace}
		<WorkspaceLoadError subject="Personnel" />
	{:else if importIds.current?.state === 'failed'}
		<WorkspaceLoadError subject="Personnel import" />
	{:else}
		{#if importIds.current?.state === 'ready' && importIds.current.stale}
			<WorkspaceLoadError subject="Personnel import" stale />
		{/if}
		<ImportFlow {lane} title="Import roster" eyebrow="Personnel · Import" />
	{/if}
{/key}
