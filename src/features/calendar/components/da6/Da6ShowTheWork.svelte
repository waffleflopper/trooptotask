<script lang="ts">
	import { formatDayMonth } from '$lib/utils/dates';
	import { workedExample } from '../../utils/da6View';
	import type { Da6Segment } from '../../roster/rosterTypes';

	interface Props {
		segment: Da6Segment;
		column: number;
	}

	let { segment, column }: Props = $props();

	const day = $derived(segment.columns[column]);
	const separate = $derived(segment.weekendMode === 'separate');
</script>

<section class="grid gap-4 lg:grid-cols-3 print:hidden" aria-label="Show the work">
	<div class="border-l-[3px] border-foreground pl-4">
		<h2 class="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
			The rule · DA PAM 220-45, para 6
		</h2>
		<p class="mt-1.5">
			Each detail day, everyone available gets one more. The highest number pulls duty and starts over at 1.
			{#if separate}Weekends and holidays keep their own count, in red.{/if}
		</p>
	</div>
	<div class="border-l-[3px] border-accent pl-4" aria-live="polite">
		<h2 class="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
			{formatDayMonth(day.date)}, {day.when === 'served' ? 'worked out' : 'planned'}
		</h2>
		<p class="mt-1.5">{workedExample(segment, column)}</p>
	</div>
	<div class="border-l-[3px] border-border pl-4">
		<h2 class="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Ties</h2>
		<p class="mt-1.5">
			Higher rank goes first. Same rank goes alphabetically by last name. That’s the order of names on this form, so
			anyone can check a pick by eye.
		</p>
	</div>
</section>
