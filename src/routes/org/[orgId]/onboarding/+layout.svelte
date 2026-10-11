<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { onboardingWorkspaceHydrator, onboardingStore } from '$features/onboarding';
	import type { OnboardingWorkspaceResult } from '$features/onboarding/contracts';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	onDestroy(() => {
		onboardingStore.invalidatePendingRequests();
		onboardingWorkspaceHydrator.reset();
	});
	let hydrationError = $state<Error | null>(null);

	$effect(() => {
		const orgId = data.shell.org.id;
		untrack(() => {
			if (onboardingStore.orgId !== orgId) onboardingWorkspaceHydrator.reset();
			onboardingStore.enterOrganization(orgId);
		});
		hydrationError = null;

		return hydrateStreamedWorkspace<OnboardingWorkspaceResult>({
			streamedWorkspace: data.onboarding,
			fallbackMessage: 'Failed to hydrate onboarding workspace',
			hydrate: (onboarding) => onboardingWorkspaceHydrator.hydrate(onboarding.hydration),
			onReject: (error) => {
				hydrationError = error;
			}
		});
	});
</script>

{#if hydrationError}
	<WorkspaceLoadError subject="Onboarding" />
{:else}
	{@render children()}
{/if}
