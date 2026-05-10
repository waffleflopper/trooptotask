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
	const loadingSkeletonItems = [0, 1, 2];
	let onboardingBootstrap = $state<WorkspaceBootstrap<OnboardingBootstrap> | null>(null);
	let loadError = $state<Error | null>(null);
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

		// The layout also observes this promise to hydrate shared stores; the page separately
		// materializes the resolved bootstrap so it can construct the local page context.
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
	const ctx = $derived(onboardingBootstrap ? new OnboardingPageContext(modals, org) : null);
</script>

<svelte:head>
	<title>Onboarding - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="grid gap-4 p-3 sm:px-6 sm:py-5" aria-busy="true" aria-live="polite" role="status">
		<div class="flex flex-wrap items-center gap-3">
			<SkeletonLine width="124px" height="12px" />
			<SkeletonLine width="96px" height="12px" />
		</div>
		<div class="grid gap-3 min-[721px]:grid-cols-3">
			{#each loadingSkeletonItems as item (item)}
				<SkeletonBlock height="116px" />
			{/each}
		</div>
		<div class="grid gap-3">
			{#each loadingSkeletonItems as item (item)}
				<SkeletonBlock height="88px" />
			{/each}
		</div>
	</section>
{:else if ctx}
	<OnboardingPageView {ctx} />
	<OnboardingModals {ctx} />
{/if}
