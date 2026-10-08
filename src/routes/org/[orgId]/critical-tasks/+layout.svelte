<script lang="ts">
	import { afterNavigate, invalidate } from '$app/navigation';
	import {
		criticalTasksWorkspaceHydrator,
		criticalTasksWorkspaceStatus,
		markCriticalTasksWorkspacePending,
		markCriticalTasksWorkspaceRejected,
		markCriticalTasksWorkspaceResolved,
		personnelIctCompletionsStore,
		resetCriticalTasksWorkspaceStatus
	} from '$features/critical-tasks';
	import type {
		CriticalTasksWorkspaceRestricted,
		CriticalTasksWorkspaceResult
	} from '$features/critical-tasks/contracts';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceAccessRestricted from '../WorkspaceAccessRestricted.svelte';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	let workspacePending = $state(false);
	let accessRestricted = $state(false);
	const orgId = $derived.by(() => {
		if (typeof data.orgId === 'string') {
			return data.orgId;
		}

		const shellOrgId = data.shell?.org?.id;
		return typeof shellOrgId === 'string' ? shellOrgId : null;
	});
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate Critical Tasks workspace');
		}
		return null;
	});

	afterNavigate(() => {
		if (!criticalTasksWorkspaceStatus.refreshRequested) return;
		criticalTasksWorkspaceStatus.refreshRequested = false;
		void invalidate('app:critical-tasks-data');
	});

	$effect(() => {
		hydrationError = null;
		accessRestricted = false;

		return hydrateStreamedWorkspace<CriticalTasksWorkspaceResult | CriticalTasksWorkspaceRestricted>({
			streamedWorkspace: data.criticalTasks,
			fallbackMessage: 'Failed to hydrate Critical Tasks workspace',
			onPending: () => {
				workspacePending = true;
				personnelIctCompletionsStore.invalidateImports();
				markCriticalTasksWorkspacePending(orgId);
			},
			onResolved: (criticalTasks) => {
				workspacePending = false;
				if ('access' in criticalTasks) {
					accessRestricted = true;
					resetCriticalTasksWorkspaceStatus();
					if (orgId) criticalTasksWorkspaceHydrator.restrict(orgId);
					return;
				}
				markCriticalTasksWorkspaceResolved(criticalTasks);
			},
			hydrate: (criticalTasks) => {
				if ('access' in criticalTasks) return;
				return criticalTasksWorkspaceHydrator.hydrate(criticalTasks.hydration);
			},
			onReject: (error) => {
				workspacePending = false;
				hydrationError = error;
				markCriticalTasksWorkspaceRejected(error, orgId);
			}
		});
	});
</script>

{#if hydrationError}
	{renderHydrationError}
{:else if accessRestricted}
	<WorkspaceAccessRestricted subject="Critical Tasks" />
{:else if !workspacePending}
	{@render children()}
{/if}
