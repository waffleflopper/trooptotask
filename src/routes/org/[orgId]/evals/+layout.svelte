<script lang="ts">
	import { ratingSchemeWorkspaceHydrator } from '$features/rating-scheme';
	import type { RatingSchemeWorkspaceResult, RatingSchemeWorkspaceRestricted } from '$features/rating-scheme/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	let accessRestricted = $state(false);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate Rating Scheme workspace');
		}
		return null;
	});

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
	{renderHydrationError}
{:else if accessRestricted}
	<PageShell.Root>
		<Alert.Root>
			<Alert.Title>Access Restricted</Alert.Title>
			<Alert.Description
				>You don't have permission to view evaluations. Contact your organization admin for access.</Alert.Description
			>
		</Alert.Root>
	</PageShell.Root>
{:else}
	{@render children()}
{/if}
