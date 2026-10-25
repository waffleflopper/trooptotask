<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDate } from '$lib/utils/dates';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let retrying = $state(false);

	async function retry() {
		retrying = true;
		try {
			await invalidateAll();
		} finally {
			retrying = false;
		}
	}
</script>

<svelte:head>
	<title>What's new - Troop to Task</title>
</svelte:head>

<PageShell.Root width="content" density="compact">
	<PageShell.Header title="What's new" subtitle="Every update to TroopToTask, newest first." />

	{#await data.entries}
		<div class="grid gap-3" role="status" aria-label="Loading updates">
			{#each [0, 1, 2] as placeholder (placeholder)}
				<Card.Root>
					<Card.Header class="gap-2">
						<Skeleton class="h-6 w-2/3" />
						<Skeleton class="h-4 w-24" />
					</Card.Header>
					<Card.Content class="grid gap-2">
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-3/4" />
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:then result}
		{#if result.status === 'failed'}
			<Alert.Root variant="destructive">
				<Alert.Title>Updates could not be loaded</Alert.Title>
				<Alert.Description>Try again in a moment.</Alert.Description>
				<div class="mt-3">
					<Button variant="outline" onclick={retry} aria-disabled={retrying ? 'true' : undefined}>
						{#if retrying}<Spinner />{/if}
						Retry
					</Button>
				</div>
			</Alert.Root>
		{:else if result.entries.length === 0}
			<Card.Root>
				<Card.Content>
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>Nothing new yet.</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="grid gap-3">
				{#each result.entries as entry (entry.id)}
					<Card.Root>
						<Card.Header class="gap-1">
							<Card.Title class="text-lg">{entry.title}</Card.Title>
							<Card.Description>{formatDisplayDate(entry.publishedOn)}</Card.Description>
						</Card.Header>
						<Card.Content class="grid gap-3">
							{#each entry.paragraphs as paragraph, index (`${entry.id}:${index}`)}
								<p class="m-0 text-sm leading-6">{paragraph}</p>
							{/each}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	{/await}
</PageShell.Root>
