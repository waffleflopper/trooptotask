<script lang="ts">
	let { ctx }: { ctx: { view: { searchQuery: string } } } = $props();
</script>

<div data-testid="visible-stub">
	<input aria-label="Probe search" bind:value={ctx.view.searchQuery} />
</div>
