<script lang="ts">
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { RatingSchemePageContext } from '$features/rating-scheme/contexts/RatingSchemePageContext.svelte';
	import type { RatingSchemePageData } from '$features/rating-scheme/contexts/RatingSchemePageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';
	import type { RatingSchemeWorkspaceResult } from '$features/rating-scheme/server/ratingSchemeWorkspaceBootstrap';
	import RatingSchemePageView from '$features/rating-scheme/components/RatingSchemePageView.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	let ratingSchemeBootstrap = $state<RatingSchemeWorkspaceResult | null>(null);
	let loadError = $state<Error | null>(null);
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load Rating Scheme workspace');
		}
		return null;
	});

	function createPageData(workspace: RatingSchemeWorkspaceResult): RatingSchemePageData {
		return {
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			ratingSchemeEntries: workspace.data.ratingSchemeEntries,
			lossWarningWindowDays: workspace.data.lossWarningWindowDays
		};
	}

	function createContext(workspace: RatingSchemeWorkspaceResult): RatingSchemePageContext {
		return new RatingSchemePageContext(createPageData(workspace), modals, org, ratingSchemeStore);
	}

	const streamedRatingScheme = $derived(data.ratingScheme?.data);
	const immediateRatingScheme = $derived.by(() =>
		streamedRatingScheme && !isPromiseLike(streamedRatingScheme)
			? (streamedRatingScheme as RatingSchemeWorkspaceResult)
			: null
	);
	const resolvedRatingScheme = $derived(ratingSchemeBootstrap ?? immediateRatingScheme);
	const workspacePending = $derived(!!streamedRatingScheme && !resolvedRatingScheme && loadError === null);

	$effect(() => {
		let cancelled = false;

		ratingSchemeBootstrap = null;
		loadError = null;

		if (!streamedRatingScheme || !isPromiseLike(streamedRatingScheme)) {
			return;
		}

		void observeDeferred(streamedRatingScheme, {
			fallbackMessage: 'Failed to load Rating Scheme workspace',
			onResolve: (ratingScheme) => {
				ratingSchemeBootstrap = ratingScheme;
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

<svelte:head>
	<title>Evals - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="grid gap-4 p-3 sm:px-6 sm:py-5" aria-busy="true" aria-live="polite" role="status">
		<div class="flex flex-wrap items-center gap-3">
			<Skeleton class="h-3 w-[124px]" />
			<Skeleton class="h-3 w-24" />
		</div>
		<Skeleton class="h-[320px] w-full" />
	</section>
{:else if resolvedRatingScheme}
	{@const ctx = createContext(resolvedRatingScheme)}
	{@const personnelLookup = resolvedRatingScheme.data.personnelLookup}
	<RatingSchemePageView {ctx} {personnelLookup} />
	{#await import('$features/rating-scheme/components/RatingSchemeModals.svelte') then { default: RatingSchemeModals }}
		<RatingSchemeModals {ctx} {modals} {personnelLookup} />
	{/await}
{:else}
	{throwRenderError(new Error('Missing Rating Scheme workspace data'), 'Failed to load Rating Scheme workspace')}
{/if}
