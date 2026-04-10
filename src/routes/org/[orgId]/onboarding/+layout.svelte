<script lang="ts">
	import { orgShellCoordinator } from '$lib/orgShellCoordinator.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	const coordinator = orgShellCoordinator;

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate onboarding workspace');
		}
		return null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedOnboarding = data.onboarding?.data;

		hydrationError = null;

		if (!streamedOnboarding) {
			return;
		}

		if (!isPromiseLike(streamedOnboarding)) {
			void observeDeferred(
				coordinator.hydrate((streamedOnboarding as WorkspaceBootstrap<OnboardingBootstrap>).hydration),
				{
					fallbackMessage: 'Failed to hydrate onboarding workspace',
					onReject: (error) => {
						hydrationError = error;
					},
					isCancelled: () => cancelled
				}
			);
			return () => {
				cancelled = true;
			};
		}

		void observeDeferred(
			streamedOnboarding.then((onboarding: WorkspaceBootstrap<OnboardingBootstrap>) =>
				coordinator.hydrate(onboarding.hydration)
			),
			{
				fallbackMessage: 'Failed to hydrate onboarding workspace',
				onReject: (error) => {
					hydrationError = error;
				},
				isCancelled: () => cancelled
			}
		);

		return () => {
			cancelled = true;
		};
	});
</script>

{#if hydrationError}
	{renderHydrationError}
{:else}
	{@render children()}
{/if}
