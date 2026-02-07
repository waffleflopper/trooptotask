<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	onMount(() => {
		themeStore.init();
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
