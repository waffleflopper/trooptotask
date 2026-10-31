<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { showSubGroups } from '$lib/stores/showSubGroups.svelte';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { deferToIdle } from '$lib/utils/deferToIdle';
	import { rememberViewerTimeZone, VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
	import { navigateWithoutRefreshOnSameUrlClick } from '$lib/utils/sameUrlLinkClick';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();

	onMount(() => {
		themeStore.init();
		showSubGroups.init();
		if (rememberViewerTimeZone()) void invalidate(VIEWER_DAY_DEPENDENCY);

		const cancelIdle = deferToIdle(() => {
			void Promise.all([import('@vercel/analytics'), import('@vercel/speed-insights')])
				.then(([{ inject }, { injectSpeedInsights }]) => {
					inject();
					injectSpeedInsights();
				})
				.catch(() => {
					// Best-effort: analytics failure should not surface to the user
				});
		});

		return () => {
			cancelIdle();
		};
	});
</script>

<svelte:body onclick={navigateWithoutRefreshOnSameUrlClick} />

<div class="flex h-screen flex-col">
	{@render children()}
</div>
<div class="contents" data-print-chrome>
	<Toaster />
</div>
