<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { EventDates, EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import { taskingsToReview } from '../eventWorkModel';
	import type { GroupLabels, Tasking } from '../taskingModel';
	import ReviewTaskingList from './ReviewTaskingList.svelte';

	interface Props {
		org: CalendarEventsPageAccess;
		taskings: Promise<EventRead<{ taskings: Tasking[]; groups: GroupLabels }>>;
		before: EventDates;
		after: EventDates;
		onDismiss: () => void;
	}

	let { org, taskings, before, after, onDismiss }: Props = $props();

	const streamed = new StreamedValue(() => taskings);
	const loaded = $derived.by(() => {
		const current = streamed.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		if (current.value.status !== 'loaded') return 'failed' as const;
		return {
			groups: current.value.value.groups,
			items: taskingsToReview(current.value.value.taskings, before, after).map((item) => ({
				tasking: item.tasking,
				note: item.movedFrom
					? `Moved from ${item.movedFrom} to ${item.phase}`
					: `Outside the new dates, in ${item.phase}`
			}))
		};
	});
</script>

<section class="grid gap-3" aria-labelledby="event-date-review-heading">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 id="event-date-review-heading" class="font-heading text-lg font-semibold">Review taskings</h2>
		<Button variant="ghost" size="sm" onclick={onDismiss}>Dismiss</Button>
	</div>
	{#if loaded === null}
		<div class="grid gap-2" role="status" aria-label="Loading taskings to review">
			{#each [0, 1] as placeholder (placeholder)}
				<Skeleton class="h-14 w-full" />
			{/each}
		</div>
	{:else if loaded === 'failed'}
		<EventLoadFailed title="Taskings to review could not be loaded" />
	{:else if loaded.items.length === 0}
		<Alert.Root>
			<Alert.Description>No active tasking sits outside the new dates.</Alert.Description>
		</Alert.Root>
	{:else}
		<p class="m-0 text-sm text-muted-foreground">No tasking was changed. Open each one to review its dates.</p>
		<ReviewTaskingList {org} items={loaded.items} groupLabels={loaded.groups} edit />
	{/if}
</section>
