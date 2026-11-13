<script lang="ts">
	import type { RatingSchemeLinesContext } from '$features/rating-scheme';

	let { ctx }: { ctx: RatingSchemeLinesContext } = $props();
</script>

<div data-testid="visible-stub">
	<input aria-label="Probe search" bind:value={ctx.view.searchQuery} />
</div>
