<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { deferToIdle } from '$lib/utils/deferToIdle';
	import { rememberViewerTimeZone } from '$lib/utils/viewerTimeZone';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();

	onMount(() => {
		themeStore.init();
		rememberViewerTimeZone();

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

<div class="flex h-screen flex-col">
	{@render children()}
</div>
<div class="contents" data-print-chrome>
	<Toaster />
</div>
