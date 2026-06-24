<script lang="ts">
	import Page from './+page.svelte';

	let { data } = $props();
</script>

<svelte:boundary>
	<Page {data} />

	{#snippet failed(error)}
		<section role="alert" data-testid="route-error-boundary">
			{error instanceof Error ? error.message : 'Route rendering failed'}
		</section>
	{/snippet}
</svelte:boundary>
