<script lang="ts">
	import { ratingSchemeWorkspaceHydrator } from '$features/rating-scheme';
	import type { RatingSchemeWorkspaceResult, RatingSchemeWorkspaceRestricted } from '$features/rating-scheme/contracts';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceAccessRestricted from '../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	let accessRestricted = $state(false);

	$effect(() => {
		hydrationError = null;
		accessRestricted = false;
		const orgId = data.shell.org.id;

		return hydrateStreamedWorkspace<RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted>({
			streamedWorkspace: data.ratingScheme,
			fallbackMessage: 'Failed to hydrate Rating Scheme workspace',
			hydrate: (ratingScheme) => {
				if ('access' in ratingScheme) {
					ratingSchemeWorkspaceHydrator.restrict(orgId);
					accessRestricted = true;
					return;
				}
				return ratingSchemeWorkspaceHydrator.hydrate(ratingScheme.hydration);
			},
			onReject: (error) => {
				hydrationError = error;
			}
		});
	});
</script>

{#if hydrationError}
	<WorkspaceLoadError subject="Evals" />
{:else if accessRestricted}
	<WorkspaceAccessRestricted subject="evaluations" />
{:else}
	{@render children()}
{/if}
