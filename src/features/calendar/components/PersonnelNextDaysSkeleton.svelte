<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { days = 14, legendLines }: { days?: number; legendLines?: number } = $props();
</script>

<div class="flex min-w-0 flex-col gap-3" aria-hidden="true">
	<div class="flex flex-col gap-1.5">
		<div class="grid gap-x-[3px]" style:grid-template-columns="repeat({days}, minmax(0, 1fr))">
			{#each { length: days }, index (index)}
				<div class="flex flex-col gap-0.5 border-t-[3px] border-border px-1.5 pt-2 pb-1">
					<Skeleton class="h-3 w-5" />
					<Skeleton class="h-6 w-4" />
				</div>
			{/each}
		</div>
		<Skeleton class="h-[26px] w-full" />
	</div>
	{#if legendLines}
		<div class="flex flex-col gap-y-1">
			{#each { length: legendLines }, index (index)}
				<Skeleton class="h-5 {index === 0 ? 'w-full' : 'w-2/3'}" />
			{/each}
		</div>
	{:else}
		<div class="flex gap-5">
			<Skeleton class="h-5 w-28" />
			<Skeleton class="h-5 w-44" />
		</div>
	{/if}
</div>
