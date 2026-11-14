<script lang="ts">
	import Layout from '../+layout.svelte';
	import Page from './+page.svelte';

	let { data }: { data: never } = $props();
</script>

<Layout {data}>
	<Page {data} />
</Layout>
