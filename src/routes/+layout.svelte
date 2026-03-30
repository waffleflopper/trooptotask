<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { deferToIdle } from '$lib/utils/deferToIdle';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import HelpPanel from '$lib/components/ui/HelpPanel.svelte';

	let { children, data } = $props();

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
