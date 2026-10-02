<script lang="ts">
	import { RatingSchemePageContext, RatingSchemePageView, loadRatingSchemeModals } from '$features/rating-scheme';
	import type { RatingSchemePageData } from '$features/rating-scheme';
	import { submitDeletionRequest } from '$features/deletion-requests';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';
	import type { RatingSchemeWorkspaceResult, RatingSchemeWorkspaceRestricted } from '$features/rating-scheme/contracts';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	let ratingSchemeBootstrap = $state<RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted | null>(null);
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
		return new RatingSchemePageContext(createPageData(workspace), modals, org);
	}

	const streamedRatingScheme = $derived(data.ratingScheme?.data);
	const immediateRatingScheme = $derived.by(() =>
		streamedRatingScheme && !isPromiseLike(streamedRatingScheme)
			? (streamedRatingScheme as RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted)
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
	{#if !('access' in resolvedRatingScheme)}
		{@const ctx = createContext(resolvedRatingScheme)}
		{@const personnelLookup = resolvedRatingScheme.data.personnelLookup}
		<RatingSchemePageView {ctx} {personnelLookup} />
		{#await loadRatingSchemeModals() then { default: RatingSchemeModals }}
			<RatingSchemeModals
				{modals}
				{personnelLookup}
				onRequestDeletion={(id, description) =>
					submitDeletionRequest(ctx.orgId, 'rating_scheme_entry', id, description, `/org/${ctx.orgId}/evals`)}
			/>
		{/await}
	{/if}
{:else}
	{throwRenderError(new Error('Missing Rating Scheme workspace data'), 'Failed to load Rating Scheme workspace')}
{/if}
