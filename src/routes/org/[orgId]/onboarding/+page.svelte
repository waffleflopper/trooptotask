<script lang="ts">
	import { OnboardingPageContext } from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import type { OnboardingWorkspaceResult } from '$features/onboarding/server/onboardingWorkspaceBootstrap';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import OnboardingKanbanView from '$features/onboarding/components/OnboardingKanbanView.svelte';
	import { MODAL_IDS } from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const loadingSkeletonItems = [0, 1, 2];
	let onboardingBootstrap = $state<OnboardingWorkspaceResult | null>(null);
	let OnboardingModals = $state<
		typeof import('$features/onboarding/components/OnboardingModals.svelte').default | null
	>(null);
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
			onboardingBootstrap = streamedOnboarding as OnboardingWorkspaceResult;
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
	const needsModalSurface = $derived(
		!!ctx &&
			(ctx.modals.isOpen(MODAL_IDS.startOnboarding) ||
				!!ctx.cancellingId ||
				!!ctx.completingId ||
				!!ctx.switchingTemplateId ||
				!!ctx.assigningTemplateId)
	);

	$effect(() => {
		if (!needsModalSurface || OnboardingModals) return;

		let cancelled = false;
		void import('$features/onboarding/components/OnboardingModals.svelte').then((module) => {
			if (!cancelled) {
				OnboardingModals = module.default;
			}
		});

		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<title>Onboarding - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="grid gap-4 p-3 sm:px-6 sm:py-5" aria-busy="true" aria-live="polite" role="status">
		<div class="flex flex-wrap items-center gap-3">
			<Skeleton class="h-3 w-[124px]" />
			<Skeleton class="h-3 w-24" />
		</div>
		<div class="grid gap-3 min-[721px]:grid-cols-3">
			{#each loadingSkeletonItems as item (item)}
				<Skeleton class="h-[116px] w-full" />
			{/each}
		</div>
		<div class="grid gap-3">
			{#each loadingSkeletonItems as item (item)}
				<Skeleton class="h-[88px] w-full" />
			{/each}
		</div>
	</section>
{:else if ctx}
	<OnboardingKanbanView {ctx} />
	{#if needsModalSurface && OnboardingModals}
		<OnboardingModals {ctx} />
	{/if}
{/if}
