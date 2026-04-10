<script lang="ts">
	import { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { TrainingPageData } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import TrainingPageView from '$features/training/components/TrainingPageView.svelte';
	import TrainingModals from '$features/training/components/TrainingModals.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	let trainingBootstrap = $state<WorkspaceBootstrap<TrainingBootstrap> | null>(null);
	let loadError = $state<Error | null>(null);
	let ctx = $state<TrainingPageContext | null>(null);
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load training workspace');
		}
		return null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedTraining = data.training?.data;

		trainingBootstrap = null;
		loadError = null;

		if (!streamedTraining) {
			return;
		}

		if (!isPromiseLike(streamedTraining)) {
			trainingBootstrap = streamedTraining as WorkspaceBootstrap<TrainingBootstrap>;
			return;
		}

		void observeDeferred(streamedTraining, {
			fallbackMessage: 'Failed to load training workspace',
			onResolve: (training) => {
				trainingBootstrap = training;
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

	const workspacePending = $derived(!!data.training?.data && trainingBootstrap === null && loadError === null);
	const pageData = $derived.by((): TrainingPageData | null =>
		trainingBootstrap
			? {
					orgId: data.orgId,
					orgName: data.orgName,
					userPreferences: data.userPreferences,
					permissions: data.permissions,
					training: {
						data: trainingBootstrap.data
					}
				}
			: null
	);

	$effect.pre(() => {
		ctx = pageData ? new TrainingPageContext(pageData, modals, org) : null;
	});
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="workspace-loading" aria-busy="true" aria-live="polite" role="status">
		<div class="workspace-loading__stats">
			{#each Array(5) as _}
				<SkeletonBlock width="100px" height="52px" />
			{/each}
		</div>
		<div class="workspace-loading__filters">
			<SkeletonBlock height="44px" />
			<SkeletonBlock height="44px" />
		</div>
		<SkeletonGrid rows={8} columns={6} cellWidth="100px" cellHeight="38px" />
	</section>
{:else if ctx}
	<TrainingPageView {ctx} {modals} />
	<TrainingModals {ctx} {modals} />
{/if}

<style>
	.workspace-loading {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-3);
	}

	.workspace-loading__stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: var(--sp-2);
	}

	.workspace-loading__filters {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-2);
	}

	@media (max-width: 720px) {
		.workspace-loading__filters {
			grid-template-columns: 1fr;
		}
	}
</style>
