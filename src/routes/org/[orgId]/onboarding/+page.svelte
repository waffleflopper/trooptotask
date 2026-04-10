<script lang="ts">
	import { OnboardingPageContext } from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import OnboardingPageView from '$features/onboarding/components/OnboardingPageView.svelte';
	import OnboardingModals from '$features/onboarding/components/OnboardingModals.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonLine from '$lib/components/ui/SkeletonLine.svelte';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	let onboardingBootstrap = $state<WorkspaceBootstrap<OnboardingBootstrap> | null>(null);
	let loadError = $state<Error | null>(null);
	let ctx = $state<OnboardingPageContext | null>(null);
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load onboarding workspace');
		}
		return null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedOnboarding = data.onboarding?.data;

		onboardingBootstrap = null;
		loadError = null;

		if (!streamedOnboarding) {
			return;
		}

		if (!isPromiseLike(streamedOnboarding)) {
			onboardingBootstrap = streamedOnboarding as WorkspaceBootstrap<OnboardingBootstrap>;
			return;
		}

		void observeDeferred(streamedOnboarding, {
			fallbackMessage: 'Failed to load onboarding workspace',
			onResolve: (onboarding) => {
				onboardingBootstrap = onboarding;
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

	const workspacePending = $derived(!!data.onboarding?.data && onboardingBootstrap === null && loadError === null);

	$effect.pre(() => {
		ctx = onboardingBootstrap ? new OnboardingPageContext(modals, org) : null;
	});
</script>

<svelte:head>
	<title>Onboarding - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="workspace-loading" aria-busy="true" aria-live="polite" role="status">
		<div class="workspace-loading__header">
			<SkeletonLine width="124px" height="12px" />
			<SkeletonLine width="96px" height="12px" />
		</div>
		<div class="workspace-loading__overview">
			{#each Array(3) as _}
				<SkeletonBlock height="116px" />
			{/each}
		</div>
		<div class="workspace-loading__list">
			{#each Array(3) as _}
				<SkeletonBlock height="88px" />
			{/each}
		</div>
	</section>
{:else if ctx}
	<OnboardingPageView {ctx} />
	<OnboardingModals {ctx} />
{/if}

<style>
	.workspace-loading {
		display: grid;
		gap: var(--sp-4);
		padding: var(--sp-5) var(--sp-6) var(--sp-6);
	}

	.workspace-loading__header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: center;
	}

	.workspace-loading__overview {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.workspace-loading__list {
		display: grid;
		gap: var(--sp-3);
	}

	@media (max-width: 720px) {
		.workspace-loading__overview {
			grid-template-columns: 1fr;
		}
	}
</style>
