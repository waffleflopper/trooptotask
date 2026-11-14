<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { CalendarViewMode } from '$features/calendar/utils/calendarRange';
	import CalendarAgendaSkeleton from './CalendarAgendaSkeleton.svelte';
	import CalendarWeekSkeleton from './CalendarWeekSkeleton.svelte';

	interface Props {
		/** The view the Calendar will show; null while the width alone decides, so CSS picks between Agenda and Month. */
		view: CalendarViewMode | null;
	}

	let { view }: Props = $props();
</script>

{#snippet monthGrid(className: string)}
	<div class="grid grid-cols-7 gap-1 {className}">
		{#each { length: 49 }, index (index)}
			<Skeleton class="h-20 rounded-md" data-testid="skeleton-grid-cell" />
		{/each}
	</div>
{/snippet}

{#if view === null}
	<div class="min-[641px]:hidden"><CalendarAgendaSkeleton /></div>
	{@render monthGrid('max-[641px]:hidden')}
{:else if view === '3-month'}
	<Skeleton class="h-[min(820px,calc(100dvh-10rem))] w-full rounded-lg" />
{:else if view === 'week'}
	<CalendarWeekSkeleton />
{:else if view === 'agenda'}
	<CalendarAgendaSkeleton />
{:else}
	{@render monthGrid('')}
{/if}
