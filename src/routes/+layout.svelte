<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { inject } from '@vercel/analytics';
	import { injectSpeedInsights } from '@vercel/speed-insights';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import HelpPanel from '$lib/components/ui/HelpPanel.svelte';

	let { children, data } = $props();

	onMount(() => {
		themeStore.init();
		inject();
		injectSpeedInsights();

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

		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	{@html `<link
		rel="preload"
		as="style"
		href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap"
		onload="this.rel='stylesheet'"
	/>`}
	<noscript>
		<link
			href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap"
			rel="stylesheet"
		/>
	</noscript>
</svelte:head>

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
