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
