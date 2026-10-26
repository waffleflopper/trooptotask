<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { reloadCalendarEvents } from '../../../events/eventPageState';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { EventRead } from '../../../events/eventModel';
	import type { Tasking, TaskingExecution } from '../../taskingModel';
	import { setAvailabilityHref } from '../availabilityPrefill';
	import type { TaskingPick } from '../staffingModel';
	import { availabilityGapLabel } from './staffingLabels';

	interface Props {
		orgUrlSegment: string;
		tasking: Tasking;
		execution: TaskingExecution;
		/** Picks that count, among those the reader may set Availability for. */
		targets: TaskingPick[];
		gaps: Promise<EventRead<string[]>>;
	}

	let { orgUrlSegment, tasking, execution, targets, gaps }: Props = $props();

	const streamed = new StreamedValue(() => gaps);
	// A refresh keeps the last coverage, which only answers for the picks and dates it was read for.
	// A save updates picks and dates before its refreshed read arrives, so a read answers for what was
	// asked when it arrived, never for a later change.
	const askedFor = $derived(JSON.stringify([targets.map((t) => t.personnelId), execution]));
	let answeredFor = $state<string | null>(null);
	let latestRead: Promise<unknown> | null = null;
	$effect(() => {
		const read = gaps;
		if (read === latestRead) return;
		latestRead = read;
		const key = untrack(() => askedFor);
		const settle = () => {
			if (read === latestRead) answeredFor = key;
		};
		read.then(settle, settle);
	});
	const uncovered = $derived.by(() => {
		if (answeredFor !== askedFor) return null;
		const current = streamed.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		if (current.value.status !== 'loaded') return 'failed' as const;
		const ids = new Set(current.value.value);
		return targets.filter((target) => ids.has(target.personnelId)).length;
	});
</script>

<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
	<div class="flex min-h-10 min-w-0 flex-1 basis-72 items-center sm:min-h-8">
		{#if uncovered === null}
			<div role="status" aria-label="Checking Availability" class="w-72 max-w-full">
				<Skeleton class="h-5 w-full" />
			</div>
		{:else if uncovered === 'failed'}
			<p class="m-0 flex items-center gap-2 text-sm text-muted-foreground">
				Availability could not be checked.
				<Button variant="ghost" size="sm" onclick={() => void reloadCalendarEvents()}>Retry</Button>
			</p>
		{:else}
			<p class="m-0 text-sm text-muted-foreground">{availabilityGapLabel(uncovered, targets.length)}</p>
		{/if}
	</div>
	<Button
		variant="outline"
		href={setAvailabilityHref(
			orgUrlSegment,
			tasking.id,
			execution,
			targets.map((t) => t.personnelId)
		)}
	>
		Set availability…
	</Button>
</div>
