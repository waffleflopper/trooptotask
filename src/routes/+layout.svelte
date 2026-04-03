<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { deferToIdle } from '$lib/utils/deferToIdle';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import HelpPanel from '$lib/components/ui/HelpPanel.svelte';

	let { children } = $props();

	onMount(() => {
		themeStore.init();

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

<div class="app">
	{@render children()}
</div>
<ToastContainer />
<HelpPanel />

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
	}
</style>
