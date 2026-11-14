<script lang="ts">
	import { afterNavigate, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import {
		criticalTasksWorkspaceHydrator,
		criticalTasksWorkspaceStatus,
		markCriticalTasksWorkspacePending,
		markCriticalTasksWorkspaceRejected,
		markCriticalTasksWorkspaceResolved,
		personnelIctCompletionsStore,
		resetCriticalTasksWorkspaceStatus
	} from '$features/critical-tasks';
	import CriticalTasksMatrixSkeleton from '$features/critical-tasks/components/CriticalTasksMatrixSkeleton.svelte';
	import type {
		CriticalTasksWorkspaceRestricted,
		CriticalTasksWorkspaceResult
	} from '$features/critical-tasks/contracts';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';
	import WorkspaceAccessRestricted from '../../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	const holdsWhilePending = $derived(page.route.id?.endsWith('/import') ?? false);
	const orgId = $derived.by(() => {
		if (typeof data.orgId === 'string') {
			return data.orgId;
		}

		const shellOrgId = data.shell?.org?.id;
		return typeof shellOrgId === 'string' ? shellOrgId : null;
	});

	afterNavigate(() => {
		if (!criticalTasksWorkspaceStatus.refreshRequested) return;
		criticalTasksWorkspaceStatus.refreshRequested = false;
		void invalidate('app:critical-tasks-data');
	});

	const held = new HeldWorkspace<CriticalTasksWorkspaceResult | CriticalTasksWorkspaceRestricted>({
		source: () => data.criticalTasks?.data,
		scope: () => `${orgId} ${workspaceScope(data.shell)}`,
		fallbackMessage: 'Failed to hydrate Critical Tasks workspace',
		onPending: () => {
			personnelIctCompletionsStore.invalidateImports();
			markCriticalTasksWorkspacePending(orgId);
		},
		hydrate: (criticalTasks) => {
			if ('access' in criticalTasks) {
				resetCriticalTasksWorkspaceStatus();
				if (orgId) criticalTasksWorkspaceHydrator.restrict();
				return;
			}
			markCriticalTasksWorkspaceResolved(criticalTasks);
			return criticalTasksWorkspaceHydrator.hydrate(criticalTasks.hydration);
		},
		onReject: (error) => markCriticalTasksWorkspaceRejected(error, orgId)
	});
	const workspace = $derived(held.current);
</script>

{#if workspace.status === 'failed'}
	<WorkspaceLoadError subject="Critical Tasks" />
{:else if workspace.status === 'ready' && 'access' in workspace.value}
	<WorkspaceAccessRestricted lane="criticalTasks" level="view" />
{:else if workspace.status !== 'pending' || holdsWhilePending}
	{#if workspace.status === 'ready' && workspace.refresh === 'failed'}
		<WorkspaceLoadError subject="Critical Tasks" stale />
	{/if}
	{@render children()}
{:else}
	<CriticalTasksMatrixSkeleton toolbar />
{/if}
