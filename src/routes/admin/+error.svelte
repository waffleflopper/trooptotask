<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
</script>

<svelte:head>
	<title>Error {page.status} - Admin - Troop to Task</title>
</svelte:head>

<Empty.Root class="min-h-[60vh]">
	<Empty.Header>
		<h1 class="text-7xl leading-none font-bold text-accent">{page.status}</h1>
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
		{#if page.status >= 500}
			<Button variant="outline" onclick={() => window.location.reload()}>Try again</Button>
		{/if}
		<Button href="/admin">Back to Dashboard</Button>
	</Empty.Content>
</Empty.Root>
