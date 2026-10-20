<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
</script>

<!-- Two rows, one per typical problem in the Readiness tables, with each line at its loaded row's height. -->
<div class="overflow-clip rounded-[4px] border" aria-hidden="true">
	{#each { length: 2 }, index (index)}
		<div
			class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-l-[3px] border-l-border px-3.5 py-3 last:border-b-0 sm:grid-cols-[84px_minmax(0,1fr)_112px_96px_16px]"
		>
			<Skeleton class="h-5 w-14" />
			<Skeleton class="h-4 w-16 sm:order-4" />
			<div class="col-span-2 flex flex-col gap-0.5 sm:order-2 sm:col-span-1">
				<Skeleton class="h-5 w-48" />
				<Skeleton class="h-[18px] w-64 max-w-full" />
			</div>
			<Skeleton class="h-4 w-20 max-sm:hidden sm:order-3" />
		</div>
	{/each}
</div>
