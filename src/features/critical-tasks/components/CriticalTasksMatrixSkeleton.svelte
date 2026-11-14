<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	/** `toolbar`: also stand in for the controls, for a page that has not mounted yet. */
	let { toolbar = false }: { toolbar?: boolean } = $props();
</script>

<div
	class={['flex min-h-0 flex-1 flex-col gap-3 overflow-hidden', toolbar && 'h-full p-3 md:p-4']}
	role="status"
	aria-live="polite"
	aria-label="Loading Critical Tasks"
	data-testid="critical-tasks-loading"
>
	{#if toolbar}
		<Skeleton class="h-[50px] w-full shrink-0 rounded-lg" aria-hidden="true" />
	{/if}
	<div class="flex h-[47px] shrink-0 items-center gap-2 overflow-hidden" aria-hidden="true">
		{#each { length: 5 }, chip (chip)}
			<Skeleton class="h-5 w-20 shrink-0" />
		{/each}
	</div>
	<!-- One wide Soldier column, a tall header for the rotated task names, then a row per person. -->
	<div
		class="grid min-h-0 flex-1 grid-cols-[minmax(9rem,1fr)_repeat(3,minmax(4rem,9.375rem))] content-start gap-px overflow-hidden rounded-lg border bg-border"
		aria-hidden="true"
	>
		{#each { length: 4 }, column (column)}
			<div class="flex h-52 items-center bg-muted p-3"><Skeleton class="h-3 w-14" /></div>
		{/each}
		{#each { length: 6 }, row (row)}
			<div class="grid h-20 content-center gap-2 bg-card p-3">
				<Skeleton class="h-4 w-40 max-w-full" />
				<Skeleton class="h-2 w-full" />
			</div>
			{#each { length: 3 }, cell (cell)}
				<div class="grid h-20 place-items-center bg-card"><Skeleton class="size-5 rounded-full" /></div>
			{/each}
		{/each}
	</div>
</div>
