<script lang="ts">
	import { ratingSchemeWorkspaceHydrator } from '$features/rating-scheme/ratingSchemeWorkspaceHydration.svelte';
	import type { RatingSchemeWorkspaceResult } from '$features/rating-scheme/server/ratingSchemeWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate Rating Scheme workspace');
		}
		return null;
	});

	$effect(() => {
		hydrationError = null;

		return hydrateStreamedWorkspace<RatingSchemeWorkspaceResult>({
			streamedWorkspace: data.ratingScheme,
			fallbackMessage: 'Failed to hydrate Rating Scheme workspace',
			hydrate: (ratingScheme) => ratingSchemeWorkspaceHydrator.hydrate(ratingScheme.hydration),
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
