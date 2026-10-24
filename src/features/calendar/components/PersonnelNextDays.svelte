<script lang="ts">
	import { AvailabilityStrip } from '$lib/components/patterns/calendar-bars';
	import type { PersonnelCalendarWindow } from '../calendar.types';
	import { buildPersonnelNextDays } from '../utils/personnelNextDays';

	interface Props {
		calendar: PersonnelCalendarWindow;
		/** Draws the legend as exactly this many truncated lines, so a skeleton can reserve the settled height. */
		legendLines?: number;
	}

	let { calendar, legendLines }: Props = $props();

	const days = $derived(buildPersonnelNextDays(calendar));
	const legend = $derived.by(() => {
		if (!legendLines) return null;
		const overflow = days.legend.length > legendLines;
		const shown = overflow ? days.legend.slice(0, legendLines - 1) : days.legend;
		const more = overflow ? days.legend.slice(legendLines - 1) : [];
		return { shown, more, height: `${legendLines * 1.25 + (legendLines - 1) * 0.25}rem` };
	});
</script>

<div class="flex min-w-0 flex-col gap-3">
	<div class="overflow-x-auto">
		<!-- About 2.4rem a day keeps the day numbers readable at any span. -->
		<div style:min-width="{(34 / 14) * days.columns.length}rem">
			<AvailabilityStrip size="regular" columns={days.columns} layout={days.layout} />
		</div>
	</div>
	{#if legend}
		<ul class="flex flex-col gap-y-1 overflow-hidden text-sm" style:height={legend.height}>
			{#each legend.shown as item (item.key)}
				<li class="truncate" title="{item.name} {item.detail}">
					<span class="font-semibold">{item.name}</span> <span class="text-muted-foreground">{item.detail}</span>
				</li>
			{:else}
				<li class="text-muted-foreground">Nothing on the Calendar for the next {days.columns.length} days.</li>
			{/each}
			{#if legend.more.length > 0}
				<li class="truncate text-muted-foreground">
					+{legend.more.length} more · {legend.more.map((item) => item.name).join(', ')}
				</li>
			{/if}
		</ul>
	{:else if days.legend.length > 0}
		<ul class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
			{#each days.legend as item (item.key)}
				<li><span class="font-semibold">{item.name}</span> <span class="text-muted-foreground">{item.detail}</span></li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-muted-foreground">Nothing on the Calendar for the next {days.columns.length} days.</p>
	{/if}
</div>
