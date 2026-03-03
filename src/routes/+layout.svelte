<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { inject } from '@vercel/analytics';
	import { injectSpeedInsights } from '@vercel/speed-insights';
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';

	let { children, data } = $props();

	onMount(() => {
		themeStore.init();
		inject();
		injectSpeedInsights();
	});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="app">
	{@render children()}
</div>
<ToastContainer />

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
	}
</style>
