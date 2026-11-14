<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CalendarAgendaSkeleton from './calendar-agenda/CalendarAgendaSkeleton.svelte';

	/** `grid`: the Calendar page, which opens on a month grid. `page`: any other Calendar page. */
	let { shape }: { shape: 'grid' | 'page' } = $props();
</script>

<section
	class="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:px-6 sm:pt-4 sm:pb-5"
	role="status"
	aria-live="polite"
>
	<p class="sr-only">Loading Calendar data</p>
	<!-- The title row is this tall once loaded: stacked on a phone, two rows on a tablet, one row from 1024px. -->
	<div
		class="flex h-[166px] shrink-0 flex-col justify-between overflow-hidden sm:h-[106px] lg:h-[62px]"
		aria-hidden="true"
	>
		<Skeleton class="h-3.5 w-64 max-w-full" />
		<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
			<Skeleton class="h-9 w-56" />
			<Skeleton class="h-8 w-40 lg:hidden" />
			<Skeleton class="h-8 w-60" />
		</div>
	</div>
	{#if shape === 'grid'}
		<Skeleton class="h-[50px] w-full shrink-0 rounded-lg" aria-hidden="true" />
		<!-- The page opens on Agenda below 641px and on Month from there up, so only CSS can pick the shape. -->
		<div class="min-[641px]:hidden" aria-hidden="true"><CalendarAgendaSkeleton /></div>
		<div class="grid grid-cols-7 gap-1 max-[641px]:hidden" aria-hidden="true">
			{#each { length: 49 }, index (index)}
				<Skeleton class="h-20 rounded-md" />
			{/each}
		</div>
	{:else}
		<Skeleton class="min-h-64 w-full flex-1 rounded-lg" aria-hidden="true" />
	{/if}
</section>
