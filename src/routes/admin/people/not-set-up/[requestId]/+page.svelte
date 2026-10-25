<script lang="ts">
	import RequestView from './RequestView.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.request.name} - Platform Admin</title>
</svelte:head>

{#key data.request.id}
	<RequestView {data} />
{/key}
