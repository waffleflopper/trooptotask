<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import AgendaDayCard from './AgendaDayCard.svelte';
</script>

<ol class="mx-auto flex w-full max-w-3xl flex-col gap-3" data-testid="calendar-agenda-skeleton">
	{#each { length: 7 }, index (index)}
		<li>
			<AgendaDayCard>
				{#snippet header()}
					<Skeleton class="h-4 w-24" />
					<Skeleton class="ml-auto h-4 w-16" />
				{/snippet}
				<div class="flex min-h-10 items-center gap-3 px-3 py-2">
					<Skeleton class="h-4 w-32" />
					<Skeleton class="h-5 w-24" />
				</div>
			</AgendaDayCard>
		</li>
	{/each}
</ol>
