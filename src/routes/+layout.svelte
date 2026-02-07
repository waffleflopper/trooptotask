<script lang="ts">
	import '../app.css';

	let { children, data } = $props();
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
