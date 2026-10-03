<script lang="ts">
	import Layout from './+layout.svelte';
	import Page from './+page.svelte';

	let { data } = $props();
</script>

<svelte:boundary>
	<Layout {data}>
		<Page {data} />
	</Layout>

	{#snippet failed(error)}
		<section role="alert">
			{error instanceof Error ? error.message : 'Route rendering failed'}
		</section>
	{/snippet}
</svelte:boundary>
