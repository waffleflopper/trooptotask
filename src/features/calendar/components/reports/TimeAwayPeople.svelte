<script lang="ts" module>
	export const ROWS_SHOWN = 12;
</script>

<script lang="ts">
	import type { StatusType } from '$features/calendar/contracts';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDayMonth } from '$lib/utils/dates';
	import type { NextOut, PersonTimeAway } from '../../utils/timeAway';
	import TimeAwayBar from './TimeAwayBar.svelte';

	interface Props {
		/** Already in the order to show. */
		people: PersonTimeAway[];
		spanDays: number;
		flag: number;
		/** The fraction of the span the flag sits at, named for the footer. */
		flagNote: string;
		statusTypes: readonly StatusType[];
	}

	let { people, spanDays, flag, flagNote, statusTypes }: Props = $props();

	let expanded = $state(false);
	const shown = $derived(expanded ? people : people.slice(0, ROWS_SHOWN));
	const statusName = (id: string) => statusTypes.find((status) => status.id === id)?.name ?? 'Unknown';

	function nextOutLabel(nextOut: NextOut | null): string {
		if (nextOut === null) return '—';
		const name = statusName(nextOut.statusTypeId);
		return nextOut.ongoing ? `${name} · continues` : `${name} · ${formatDayMonth(nextOut.date)}`;
	}

	function barLabel(entry: PersonTimeAway): string {
		const parts = entry.byStatus.map((status) => `${statusName(status.statusTypeId)} ${status.days}`).join(', ');
		return `${entry.person.rank} ${entry.person.lastName}, days away of ${spanDays}: ${parts || 'none'}`;
	}

	const COLUMNS = 'md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_3.5rem_3rem_minmax(0,9.5rem)]';
</script>

<div class="min-w-0">
	<div
		class="hidden items-end gap-x-4 border-b border-foreground pb-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase md:grid {COLUMNS}"
		aria-hidden="true"
	>
		<span>Person</span>
		<span class="flex justify-between gap-3">
			<span>Days by status · scale is the {spanDays}-day span</span>
			<span>{flag} d flag</span>
		</span>
		<span class="text-right">Days</span>
		<span class="text-right">Share</span>
		<span class="text-right">Next out</span>
	</div>
	<ol aria-label="Days away by person">
		{#each shown as entry (entry.person.id)}
			<li
				class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-border py-3 md:gap-y-0 {COLUMNS}"
			>
				<div class="col-start-1 row-start-1 min-w-0 md:col-auto md:row-auto">
					<p class="truncate font-serif text-[15px] font-medium">{entry.person.rank} {entry.person.lastName}</p>
					<p class="truncate font-mono text-[11px] text-muted-foreground">
						{[entry.person.groupName, entry.person.mos].filter(Boolean).join(' · ')}
					</p>
				</div>
				<TimeAwayBar
					class="col-span-2 row-start-2 h-3 md:col-auto md:row-auto"
					segments={entry.byStatus.map((status) => ({ statusTypeId: status.statusTypeId, value: status.days }))}
					max={spanDays}
					{statusTypes}
					marker={flag}
					label={barLabel(entry)}
				/>
				<p
					class={[
						'col-start-2 row-start-1 text-right font-heading text-[22px] leading-none font-bold md:col-auto md:row-auto',
						entry.totalDays >= flag && 'text-warning-foreground'
					]}
				>
					{entry.totalDays}
				</p>
				<p
					class="col-start-1 row-start-3 font-mono text-xs text-muted-foreground md:col-auto md:row-auto md:text-right"
				>
					{Math.round((entry.totalDays / spanDays) * 100)}%
					<span class="md:sr-only">of the span</span>
				</p>
				<p
					class="col-start-2 row-start-3 text-right font-mono text-xs [overflow-wrap:anywhere] md:col-auto md:row-auto"
				>
					{nextOutLabel(entry.nextOut)}
				</p>
			</li>
		{/each}
	</ol>
	<div class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
		<p class="font-mono text-[11px] text-muted-foreground">
			{#if people.length > ROWS_SHOWN}Showing {shown.length} of {people.length} ·
			{/if}Flag line at {flag}
			{flag === 1 ? 'day' : 'days'}, {flagNote}
		</p>
		{#if people.length > ROWS_SHOWN}
			<Button type="button" variant="link" size="xs" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show fewer' : `Show all ${people.length}`}
			</Button>
		{/if}
	</div>
</div>
