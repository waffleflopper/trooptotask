<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
</script>

<div class="flex min-w-0 flex-col gap-3" aria-hidden="true">
	<div class="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-x-[3px]">
		{#each { length: 14 }, index (index)}
			<div class="flex flex-col gap-1 border-t-[3px] border-border px-1.5 pt-2 pb-1">
				<Skeleton class="h-2.5 w-5" />
				<Skeleton class="h-5 w-4" />
			</div>
		{/each}
	</div>
	<Skeleton class="h-[26px] w-full" />
	<div class="flex gap-5">
		<Skeleton class="h-4 w-28" />
		<Skeleton class="h-4 w-44" />
	</div>
</div>
