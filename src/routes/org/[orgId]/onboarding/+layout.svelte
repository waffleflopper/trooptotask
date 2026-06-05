<script lang="ts">
	import { onboardingWorkspaceHydrator } from '$features/onboarding/onboardingWorkspaceHydration.svelte';
	import type { OnboardingWorkspaceResult } from '$features/onboarding/server/onboardingWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate onboarding workspace');
		}
		return null;
	});

	$effect(() => {
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
