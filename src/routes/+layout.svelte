<script lang="ts">
	import appCssUrl from '../app.css?url';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { deferToIdle } from '$lib/utils/deferToIdle';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import HelpPanel from '$lib/components/ui/HelpPanel.svelte';

	let { children, data } = $props();

	onMount(() => {
		themeStore.init();

		// Load non-critical styles asynchronously — critical CSS is already inlined in app.html.
		// media="print" prevents render-blocking; onload swaps to media="all" once downloaded.
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = appCssUrl;
		link.media = 'print';
		link.addEventListener('load', () => {
			link.media = 'all';
		});
		document.head.appendChild(link);

		const cancelIdle = deferToIdle(() => {
			void Promise.all([import('@vercel/analytics'), import('@vercel/speed-insights')]).then(
				([{ inject }, { injectSpeedInsights }]) => {
					inject();
					injectSpeedInsights();
				}
			);
		});

		const {
			data: { subscription }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase onAuthStateChange session param has complex internal type
		} = data.supabase.auth.onAuthStateChange((event: string, newSession: any) => {
			// Only invalidate on real auth changes, not the initial session detection
			// which fires SIGNED_IN on page load and would cause unnecessary re-fetches
			if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
				invalidate('supabase:auth');
			}
		});

		return () => {
			cancelIdle();
			subscription.unsubscribe();
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
