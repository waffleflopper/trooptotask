<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	// The count isn't known before the read, so this is the smallest typical table: one problem, the
	// Current group row, one current item and the counts footer. Each block matches its loaded row's height.
	// On a phone the note wraps under the count and names wrap in the narrow column; two lines is typical.
	let { label }: { label: string } = $props();
</script>

{#snippet itemRow(problem: boolean)}
	<div class="flex items-center gap-4 border-b py-2 pr-3.5 pl-[17px]">
		<Skeleton class="h-5 w-16" />
		<div class="flex grow flex-col gap-0.5">
			<Skeleton class="h-5 w-48 max-sm:h-10 max-sm:w-24" />
			<Skeleton class={['h-[18px] w-36 max-sm:w-24', problem && 'max-sm:h-9']} />
		</div>
		<Skeleton class="h-[18px] w-20" />
		<Skeleton class="h-[18px] w-20" />
		<div class="w-8"></div>
	</div>
{/snippet}

<section class="flex flex-col gap-3.5" aria-busy="true" aria-label={label}>
	<div class="flex items-end justify-between gap-4">
		<div class="flex flex-col gap-0.5">
			<Skeleton class="h-3.5 w-24" />
			<div class="flex flex-col">
				<Skeleton class="h-9 w-56 max-sm:w-40" />
				<Skeleton class="h-5 w-40 sm:hidden" />
			</div>
		</div>
		<Skeleton class="h-8 w-32" />
	</div>
	<div class="overflow-clip rounded-md border">
		<div class="border-b bg-muted py-2 pl-3.5"><Skeleton class="h-3.5 w-12" /></div>
		{@render itemRow(true)}
		<div class="border-b bg-muted py-2 pl-3.5"><Skeleton class="h-5 w-40" /></div>
		{@render itemRow(false)}
		<div class="py-2.5 pr-3.5 pl-[17px]"><Skeleton class="h-5 w-28" /></div>
	</div>
</section>
