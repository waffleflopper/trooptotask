<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { RatingSchemeWorkspaceResult, RatingSchemeWorkspaceRestricted } from '$features/rating-scheme/contracts';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
	import EvalsSkeleton from './EvalsSkeleton.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	interface Props {
		data: {
			ratingScheme?: { data: RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted | Promise<unknown> };
			[key: string]: unknown;
		};
		/** Rendered once the streamed workspace has loaded and the viewer may see it. */
		children: Snippet<[RatingSchemeWorkspaceResult]>;
		skeleton?: 'scheme' | 'tracker';
	}

	let { data, children, skeleton = 'scheme' }: Props = $props();

	let bootstrap = $state<RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted | null>(null);
	let loadError = $state<Error | null>(null);

	const streamed = $derived(data.ratingScheme?.data);
	const immediate = $derived.by(() =>
		streamed && !isPromiseLike(streamed)
			? (streamed as RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted)
			: null
	);
	const resolved = $derived(bootstrap ?? immediate);
	const pending = $derived(!!streamed && !resolved && loadError === null);

	$effect(() => {
		let cancelled = false;

		bootstrap = null;
		loadError = null;

		if (!streamed || !isPromiseLike(streamed)) return;

		void observeDeferred(streamed as Promise<RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted>, {
			fallbackMessage: 'Failed to load Rating Scheme workspace',
			onResolve: (ratingScheme) => {
				bootstrap = ratingScheme;
			},
			onReject: (error) => {
				loadError = error;
			},
			isCancelled: () => cancelled
		});

		return () => {
			cancelled = true;
		};
	});
</script>

{#if loadError}
	<!-- The Evals layout observes this same source and shows WorkspaceLoadError. -->
{:else if pending}
	<EvalsSkeleton layout={skeleton} />
{:else if resolved}
	{#if !('access' in resolved)}
		{@render children(resolved)}
	{/if}
{:else}
	<WorkspaceLoadError subject="Evals" />
{/if}
