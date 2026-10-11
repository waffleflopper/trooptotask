<script lang="ts">
	import type { Component } from 'svelte';
	import Layout from './+layout.svelte';

	let { Page, data }: { Page: Component<{ data: never }>; data: never } = $props();
</script>

<Layout {data}>
	<Page {data} />
</Layout>
