<script lang="ts">
	import {
		OnboardingPageContext,
		OnboardingActiveView,
		MODAL_IDS,
		loadOnboardingModals,
		noteAuthorLookup
	} from '$features/onboarding';
	import type { OnboardingWorkspaceResult } from '$features/onboarding/contracts';
	import { untrack } from 'svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';

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
	let OnboardingModals = $state<Awaited<ReturnType<typeof loadOnboardingModals>>['default'] | null>(null);
	const held = new HeldWorkspace<OnboardingWorkspaceResult>({
		source: () => data.onboarding?.data,
		scope: () => workspaceScope(data.shell),
		fallbackMessage: 'Failed to load onboarding workspace'
	});
	const onboardingBootstrap = $derived(held.value ?? null);
	const noteAuthorName = $derived(noteAuthorLookup(onboardingBootstrap?.data.noteAuthors ?? {}, org.userId));
	// One context serves an Organization across its refreshes, so what it has open outlives them.
	const loaded = $derived(onboardingBootstrap !== null);
	const ctx = $derived(loaded ? new OnboardingPageContext(modals, org, (userId) => noteAuthorName(userId)) : null);
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

{#if held.current.status === 'pending'}
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
