<script lang="ts">
	let { children } = $props();
</script>

<div data-testid="visible-stub">
	{#if children}
		{@render children()}
	{/if}
</div>
