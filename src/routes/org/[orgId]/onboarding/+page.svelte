<script lang="ts">
	import { OnboardingPageContext, OnboardingActiveView, MODAL_IDS, loadOnboardingModals } from '$features/onboarding';
	import type { OnboardingWorkspaceResult } from '$features/onboarding/contracts';
	import { untrack } from 'svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';

	let { data } = $props();

	const org = getAppShellContext();
	const modals = new ModalRegistry();
	let modalOrgId = org.orgId;
	$effect(() => {
		const orgId = org.orgId;
		if (orgId !== modalOrgId) untrack(() => modals.closeAll());
		modalOrgId = orgId;
	});
	const loadingSkeletonItems = [0, 1, 2, 3];
	let onboardingBootstrap = $state<OnboardingWorkspaceResult | null>(null);
	let OnboardingModals = $state<Awaited<ReturnType<typeof loadOnboardingModals>>['default'] | null>(null);
	let loadError = $state<Error | null>(null);

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
	$effect(() => {
		const context = ctx;
		return () => context?.dispose();
	});
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
		void loadOnboardingModals().then((module) => {
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

{#if workspacePending}
	<section class="grid gap-6 p-3 md:p-6" aria-live="polite" role="status" aria-label="Loading onboarding">
		<div class="grid gap-2">
			<Skeleton class="h-8 w-40" />
			<Skeleton class="h-4 w-72 max-w-full" />
		</div>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each loadingSkeletonItems as item (item)}
				<Skeleton class="h-20 w-full" />
			{/each}
		</div>
		<div class="grid gap-2">
			{#each loadingSkeletonItems as item (item)}
				<Skeleton class="h-16 w-full" />
			{/each}
		</div>
	</section>
{:else if ctx}
	{#key ctx.orgId}
		<OnboardingActiveView {ctx} typicalDaysToFinish={onboardingBootstrap?.data.typicalDaysToFinish ?? null} />
		{#if needsModalSurface && OnboardingModals && onboardingBootstrap}
			<OnboardingModals
				{ctx}
				rankCatalog={onboardingBootstrap.data.rankCatalog}
				rankCatalogUnavailable={onboardingBootstrap.data.rankCatalogUnavailable}
			/>
		{/if}
	{/key}
{/if}
