<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { label, rows = 5 }: { label: string; rows?: number } = $props();
</script>

<section class="flex flex-col gap-3.5" aria-busy="true" aria-label={label}>
	<div class="flex items-end justify-between gap-4">
		<div class="flex flex-col gap-1.5">
			<Skeleton class="h-3.5 w-24" />
			<Skeleton class="h-9 w-56" />
		</div>
		<Skeleton class="h-8 w-32" />
	</div>
	<div class="overflow-clip rounded-md border">
		<div class="h-[30px] border-b bg-muted"></div>
		{#each { length: rows }, index (index)}
			<div class="flex items-center gap-4 border-b py-3 pr-3.5 pl-[17px] last:border-b-0">
				<Skeleton class="h-5 w-16" />
				<div class="flex grow flex-col gap-1">
					<Skeleton class="h-5 w-48" />
					<Skeleton class="h-[18px] w-36" />
				</div>
				<Skeleton class="h-[18px] w-20" />
				<Skeleton class="h-[18px] w-20" />
				<div class="w-8"></div>
			</div>
		{/each}
	</div>
</section>
