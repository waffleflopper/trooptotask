<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<div
	class="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card [--calendar-cell-width:30px] [--calendar-personnel-column-width:160px] max-[641px]:[--calendar-cell-width:32px] max-[641px]:[--calendar-personnel-column-width:120px]"
	data-testid="calendar-week-skeleton"
>
	<div
		class="grid h-14 border-b bg-muted/55 [grid-template-columns:var(--calendar-personnel-column-width)_repeat(7,minmax(var(--calendar-cell-width),1fr))]"
	>
		<div class="border-r"></div>
		{#each { length: 7 }, index (index)}
			<div class="flex flex-col items-center justify-center gap-1 border-r last:border-r-0">
				<Skeleton class="h-2.5 w-5" />
				<Skeleton class="h-4 w-4" />
			</div>
		{/each}
	</div>
	{#each { length: 10 }, row (row)}
		<div
			class="grid h-9 border-b [grid-template-columns:var(--calendar-personnel-column-width)_repeat(7,minmax(var(--calendar-cell-width),1fr))]"
		>
			<div class="flex items-center border-r px-2 sm:px-3">
				<Skeleton class="h-3.5 w-full max-w-28" />
			</div>
			{#each { length: 7 }, column (column)}
				<div class="border-r last:border-r-0"></div>
			{/each}
		</div>
	{/each}
</div>
