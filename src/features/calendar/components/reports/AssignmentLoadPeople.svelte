<script lang="ts" module>
	export const ROWS_SHOWN = 12;
</script>

<script lang="ts">
	import type { AssignmentType } from '$features/calendar/contracts';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDayMonth } from '$lib/utils/dates';
	import type { PersonLoad } from '../../utils/assignmentLoad';
	import AssignmentLoadBar from './AssignmentLoadBar.svelte';

	interface Props {
		/** Already in the order to show. */
		people: PersonLoad[];
		dutyTypes: readonly AssignmentType[];
	}

	let { people, dutyTypes }: Props = $props();

	let expanded = $state(false);
	const shown = $derived(expanded ? people : people.slice(0, ROWS_SHOWN));
	const typeById = $derived(new Map(dutyTypes.map((type) => [type.id, type])));
	// Half the bar is the largest gap on screen, at least one duty, so a small gap never fills it.
	const scale = $derived(Math.max(1, Math.ceil(Math.max(...people.map((entry) => Math.abs(entry.difference)), 0))));
	const duties = (value: number) => value.toFixed(1);
	const signed = (value: number) => (value > 0 ? `+${duties(value)}` : duties(value));

	function dutyLine(entry: PersonLoad): string {
		return entry.byType
			.map((count) => `${typeById.get(count.assignmentTypeId)?.shortName ?? '?'} ${count.count}`)
			.join(' · ');
	}

	const COLUMNS = 'md:grid-cols-[minmax(0,14rem)_3rem_3rem_minmax(0,1fr)_3.5rem_5rem]';
</script>

<div class="min-w-0">
	<div
		class="hidden items-end gap-x-4 border-b border-foreground pb-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase md:grid {COLUMNS}"
		aria-hidden="true"
	>
		<span>Person</span>
		<span class="text-right">Duties</span>
		<span class="text-right">Fair</span>
		<span class="flex justify-between gap-3">
			<span>← Under</span>
			<span>Over →</span>
		</span>
		<span class="text-right">Diff</span>
		<span class="text-right">Last</span>
	</div>
	<ol aria-label="Duties against fair share by person">
		{#each shown as entry (entry.person.id)}
			<li
				class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-border py-3 md:gap-y-0 {COLUMNS}"
			>
				<div class="col-start-1 row-start-1 min-w-0 md:col-auto md:row-auto">
					<p class="truncate font-serif text-[15px] font-medium">{entry.person.rank} {entry.person.lastName}</p>
					<p class="truncate font-mono text-[11px] text-muted-foreground">
						{[entry.person.groupName, `here ${entry.presentDays} d`].filter(Boolean).join(' · ')}
					</p>
					{#if entry.byType.length > 0}
						<p class="truncate font-mono text-[11px] text-muted-foreground">{dutyLine(entry)}</p>
					{/if}
				</div>
				<p
					class="col-start-2 row-start-1 text-right font-heading text-[22px] leading-none font-bold md:col-auto md:row-auto"
				>
					{entry.total}
					<span class="sr-only">{entry.total === 1 ? 'duty' : 'duties'}</span>
				</p>
				<p
					class="col-start-1 row-start-3 font-mono text-xs text-muted-foreground md:col-auto md:row-auto md:text-right"
				>
					{duties(entry.expected)}<span class="md:sr-only"> fair share</span>
				</p>
				<div class="col-span-2 row-start-2 md:col-auto md:row-auto">
					<AssignmentLoadBar
						difference={entry.difference}
						{scale}
						label="{entry.person.rank} {entry.person.lastName}, {entry.total} {entry.total === 1
							? 'duty'
							: 'duties'} against a fair share of {duties(entry.expected)}"
					/>
				</div>
				<p
					class={[
						'col-start-2 row-start-3 text-right font-mono text-xs font-semibold md:col-auto md:row-auto',
						entry.difference > 0 && 'text-warning-foreground'
					]}
				>
					{signed(entry.difference)}
				</p>
				<p class="hidden text-right font-mono text-xs md:block">
					{entry.lastDuty ? formatDayMonth(entry.lastDuty) : 'Never'}
				</p>
			</li>
		{/each}
	</ol>
	<div class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
		<p class="font-mono text-[11px] text-muted-foreground">
			{#if people.length > ROWS_SHOWN}Showing {shown.length} of {people.length} ·
			{/if}Bar scale ±{scale}
			{scale === 1 ? 'duty' : 'duties'}
		</p>
		{#if people.length > ROWS_SHOWN}
			<Button type="button" variant="link" size="xs" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show fewer' : `Show all ${people.length}`}
			</Button>
		{/if}
	</div>
</div>
