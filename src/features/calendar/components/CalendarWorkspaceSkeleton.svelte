<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { CalendarViewMode } from '$features/calendar/utils/calendarRange';
	import CalendarViewSkeleton from './calendar-agenda/CalendarViewSkeleton.svelte';

	interface Props {
		/** `grid`: the Calendar page, shaped like the view it opens on. `page`: any other Calendar page. */
		shape: 'grid' | 'page';
		/** The remembered view, or null while the width alone decides. */
		view?: CalendarViewMode | null;
	}

	let { shape, view = null }: Props = $props();
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
		<div aria-hidden="true"><CalendarViewSkeleton {view} /></div>
	{:else}
		<Skeleton class="min-h-64 w-full flex-1 rounded-lg" aria-hidden="true" />
	{/if}
</section>
