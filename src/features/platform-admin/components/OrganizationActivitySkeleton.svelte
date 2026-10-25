<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	const ROWS = 5;
</script>

<div aria-busy="true">
	<span class="sr-only" role="status">Loading recent activity</span>
	<ul class="divide-y rounded-lg border bg-card" aria-hidden="true">
		{#each { length: ROWS } as _, index (index)}
			<li class="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
				<Skeleton class="h-5 w-72 max-w-full" />
				<Skeleton class="h-5 w-36" />
			</li>
		{/each}
	</ul>
</div>
