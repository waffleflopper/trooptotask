<script lang="ts">
	import { RatingSchemePageContext, RatingSchemePageView, loadRatingSchemeModals } from '$features/rating-scheme';
	import type { RatingSchemePageData } from '$features/rating-scheme';
	import { submitDeletionRequest } from '$features/deletion-requests';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
	import type { RatingSchemeWorkspaceResult, RatingSchemeWorkspaceRestricted } from '$features/rating-scheme/contracts';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { data } = $props();

	const org = getAppShellContext();
	const modals = new ModalRegistry();
	let ratingSchemeBootstrap = $state<RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted | null>(null);
	let loadError = $state<Error | null>(null);

	function createPageData(workspace: RatingSchemeWorkspaceResult): RatingSchemePageData {
		return {
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			ratingSchemeEntries: workspace.data.ratingSchemeEntries,
			personnelLookup: workspace.data.personnelLookup
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
	<!-- The Evals layout observes this same source and shows WorkspaceLoadError. -->
{:else if workspacePending}
	<section
		class="flex flex-col gap-4 px-6 pt-4 pb-5 max-sm:p-3"
		aria-live="polite"
		role="status"
		aria-label="Loading evaluations"
	>
		<div class="grid gap-2">
			<Skeleton class="h-3.5 w-48" />
			<Skeleton class="h-8 w-24" />
			<Skeleton class="h-4 w-full max-w-md" />
		</div>
		<Skeleton class="h-14 w-full rounded-lg" />
		<div class="grid gap-8">
			{#each [0, 1] as group (group)}
				<div class="grid gap-3">
					<Skeleton class="h-6 w-64" />
					<div class="grid gap-2 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-x-6">
						<div class="grid content-start gap-1.5">
							<Skeleton class="h-4 w-40" />
							<Skeleton class="h-3 w-24" />
						</div>
						<Skeleton class="h-28 w-full rounded-lg" />
					</div>
				</div>
			{/each}
		</div>
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
				orgId={ctx.orgId}
				onRequestDeletion={(id, description, isCurrent) =>
					submitDeletionRequest(
						ctx.orgId,
						'rating_scheme_entry',
						id,
						description,
						`/org/${ctx.orgId}/evals`,
						isCurrent
					)}
			/>
		{/await}
	{/if}
{:else}
	<WorkspaceLoadError subject="Evals" />
{/if}
