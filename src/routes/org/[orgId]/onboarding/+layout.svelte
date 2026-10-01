<script lang="ts">
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { onboardingWorkspaceHydrator, onboardingStore } from '$features/onboarding';
	import type { OnboardingWorkspaceResult } from '$features/onboarding/contracts';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	const org = getOrgContext();
	onDestroy(() => {
		onboardingStore.invalidatePendingRequests();
		onboardingWorkspaceHydrator.reset();
	});
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate onboarding workspace');
		}
		return null;
	});

	$effect(() => {
		const orgId = org.orgId;
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
	{renderHydrationError}
{:else}
	{@render children()}
{/if}
