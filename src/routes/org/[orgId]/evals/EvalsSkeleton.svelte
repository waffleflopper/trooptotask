<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	/** The tracker lists Evaluations in one table; the Rating Scheme groups lines by section. */
	let { layout = 'scheme' }: { layout?: 'scheme' | 'tracker' } = $props();
</script>

<section
	class="flex flex-col gap-4 px-6 pt-4 pb-5 max-sm:p-3"
	aria-live="polite"
	role="status"
	aria-label="Loading evaluations"
>
	<div class="grid gap-2">
		<Skeleton class="h-3.5 w-48" />
		<Skeleton class="h-9 w-32 sm:h-12" />
		<Skeleton class="h-4 w-full max-w-md" />
	</div>
	<div class="flex gap-6 border-b pt-2 pb-2.5">
		<Skeleton class="h-5 w-28" />
		<Skeleton class="h-5 w-24" />
	</div>
	<Skeleton class="h-22 w-full rounded-lg sm:h-12.5" />
	{#if layout === 'tracker'}
		<div class="overflow-clip rounded-md border max-sm:hidden">
			<Skeleton class="h-9 w-full rounded-none" />
			{#each [0, 1, 2, 3, 4] as row (row)}
				<div class="flex h-15 items-center gap-6 border-t px-4">
					<Skeleton class="h-3.5 w-20" />
					<div class="grid w-48 gap-1.5">
						<Skeleton class="h-4 w-40" />
						<Skeleton class="h-3 w-28" />
					</div>
					<Skeleton class="h-4 w-24" />
					<Skeleton class="h-3.5 w-36" />
					<Skeleton class="h-1.5 w-16" />
				</div>
			{/each}
		</div>
		<div class="grid gap-2 sm:hidden">
			{#each [0, 1, 2] as card (card)}
				<Skeleton class="h-29 w-full rounded-md" />
			{/each}
		</div>
	{:else}
		<div class="grid gap-9">
			{#each [0, 1] as group (group)}
				<div class="grid gap-1">
					<div class="border-b-2 border-foreground pb-2.5">
						<Skeleton class="h-7.5 w-72" />
					</div>
					<div class="grid gap-2 py-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-6">
						<div class="grid content-start gap-1.5 lg:pt-2.5">
							<Skeleton class="h-4 w-40" />
							<Skeleton class="h-3 w-24" />
						</div>
						<Skeleton class="h-28 w-full rounded-lg" />
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
