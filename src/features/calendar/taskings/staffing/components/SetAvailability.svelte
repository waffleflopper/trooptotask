<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { reloadCalendarEvents } from '../../../events/eventPageState';
	import type { EventRead } from '../../../events/eventModel';
	import type { Tasking, TaskingExecution } from '../../taskingModel';
	import { setAvailabilityHref } from '../availabilityPrefill';
	import type { AvailabilityCoverage, TaskingPick } from '../staffingModel';
	import { availabilityGapLabel } from './staffingLabels';

	interface Props {
		orgUrlSegment: string;
		tasking: Tasking;
		execution: TaskingExecution;
		/** Picks that count, among those the reader may set Availability for. */
		targets: TaskingPick[];
		gaps: Promise<EventRead<AvailabilityCoverage>>;
	}

	let { orgUrlSegment, tasking, execution, targets, gaps }: Props = $props();

	// Shows only the answer to the read in hand: a refresh checks again rather than keep the last count.
	let answer = $state<{ read: Promise<unknown>; coverage: AvailabilityCoverage | 'failed' } | null>(null);
	$effect(() => {
		const read = gaps;
		const settle = (coverage: AvailabilityCoverage | 'failed') => {
			if (read === gaps) answer = { read, coverage };
		};
		read.then(
			(result) => settle(result.status === 'loaded' ? result.value : 'failed'),
			() => settle('failed')
		);
	});
	const coverage = $derived(answer?.read === gaps ? answer.coverage : null);
</script>

<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
	<div class="flex min-h-10 min-w-0 flex-1 basis-72 items-center sm:min-h-8">
		{#if coverage === null}
			<div role="status" aria-label="Checking Availability" class="w-72 max-w-full">
				<Skeleton class="h-5 w-full" />
			</div>
		{:else if coverage === 'failed'}
			<p class="m-0 flex items-center gap-2 text-sm text-muted-foreground">
				Availability could not be checked.
				<Button variant="ghost" size="sm" onclick={() => void reloadCalendarEvents()}>Retry</Button>
			</p>
		{:else}
			<p class="m-0 text-sm text-muted-foreground">{availabilityGapLabel(coverage.uncovered, coverage.checked)}</p>
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
