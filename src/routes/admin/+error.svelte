<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';

	// A failed client-side data refresh can land here with a non-error status, so only a real 4xx is final.
	const label = $derived(page.status >= 400 ? String(page.status) : 'Error');
	const retryable = $derived(page.status < 400 || page.status >= 500);
</script>

<svelte:head>
	<title>{page.status >= 400 ? `Error ${page.status}` : 'Error'} - Admin - Troop to Task</title>
</svelte:head>

<Empty.Root class="min-h-[60vh]">
	<Empty.Header>
		<h1 class="text-7xl leading-none font-bold text-accent">{label}</h1>
		<Empty.Description>
			{#if page.status === 404}
				Page not found. The page you're looking for doesn't exist or has been moved.
			{:else if page.status === 403}
				You don't have permission to view this page.
			{:else}
				This admin page could not be loaded. Please try again.
			{/if}
		</Empty.Description>
	</Empty.Header>
	<Empty.Content class="flex-row flex-wrap justify-center">
		{#if retryable}
			<Button variant="outline" onclick={() => window.location.reload()}>Try again</Button>
		{/if}
		<Button href="/admin">Back to Inbox</Button>
	</Empty.Content>
</Empty.Root>
