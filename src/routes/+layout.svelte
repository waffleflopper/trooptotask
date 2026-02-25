<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { inject } from '@vercel/analytics';
	import { injectSpeedInsights } from '@vercel/speed-insights';

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

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
	}
</style>
