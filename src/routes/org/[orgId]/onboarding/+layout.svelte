<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { onboardingWorkspaceHydrator, onboardingStore } from '$features/onboarding';
	import type { OnboardingWorkspaceResult } from '$features/onboarding/contracts';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	onDestroy(() => {
		onboardingStore.invalidatePendingRequests();
		onboardingWorkspaceHydrator.reset();
	});

	$effect(() => {
		const orgId = data.shell.org.id;
		untrack(() => {
			if (onboardingStore.orgId !== orgId) onboardingWorkspaceHydrator.reset();
			onboardingStore.enterOrganization(orgId);
		});
	});

	const held = new HeldWorkspace<OnboardingWorkspaceResult>({
		source: () => data.onboarding?.data,
		scope: () => workspaceScope(data.shell),
		fallbackMessage: 'Failed to hydrate onboarding workspace',
		hydrate: (onboarding) => onboardingWorkspaceHydrator.hydrate(onboarding.hydration)
	});
</script>

{#if held.current.status === 'failed'}
	<WorkspaceLoadError subject="Onboarding" />
{:else}
	{#if held.current.status === 'ready' && held.current.refresh === 'failed'}
		<WorkspaceLoadError subject="Onboarding" stale />
	{/if}
	{@render children()}
{/if}
