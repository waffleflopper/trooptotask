<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	const ROWS = 10;
</script>

<div class="flex min-h-0 flex-col gap-4 overflow-hidden px-6 pt-4 pb-5 max-sm:p-3" aria-busy="true">
	<span class="sr-only" role="status">Loading personnel</span>
	<div class="grid gap-2" aria-hidden="true">
		<Skeleton class="h-4 w-56" />
		<div class="flex items-center gap-3">
			<Skeleton class="h-10 w-48 sm:h-12" />
			<Skeleton class="h-7 w-10" />
		</div>
	</div>
	<Skeleton class="h-9 w-full" aria-hidden="true" />
	<div class="overflow-hidden rounded-md border border-border bg-card" aria-hidden="true">
		<div class="h-10 border-b border-border bg-muted/70"></div>
		{#each { length: ROWS } as _, index (index)}
			<div class="flex h-12 items-center gap-4 border-b border-border px-2 last:border-b-0">
				<Skeleton class="size-2 rounded-full" />
				<Skeleton class="h-4 w-10" />
				<Skeleton class="h-4 w-40 max-w-[40%]" />
				<Skeleton class="ml-auto h-3 w-24" />
			</div>
		{/each}
	</div>
</div>
