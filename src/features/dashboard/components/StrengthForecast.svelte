<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		formatForecastHeadline,
		forecastDayLabel,
		longDay,
		type ForecastColumn,
		type StrengthBand
	} from '../read-model/strengthBand';

	interface Props {
		band: StrengthBand;
		today: string;
		calendarHref: string;
		/** Runs when Open calendar is chosen, before the navigation. */
		onOpenCalendar?: () => void;
		/** Overlay lanes under the day labels. */
		lanes?: Snippet;
		/** Legend entries for the lanes' marks, after the statuses. */
		laneLegend?: Snippet;
	}

	let { band, today, calendarHref, onOpenCalendar, lanes, laneLegend }: Props = $props();

	const BAR_HEIGHT = 131;

	const headline = $derived(formatForecastHeadline(band.headline, today));
	const labels = $derived(band.forecast.map((column) => (column.isToday ? 'Today' : forecastDayLabel(column.date))));
	/** Contiguous flagged columns share one amber band, as 1-based grid columns. */
	const flaggedRuns = $derived.by(() => {
		const runs: { start: number; span: number }[] = [];
		band.forecast.forEach((column, index) => {
			if (!column.belowFloor) return;
			const last = runs.at(-1);
			if (last && last.start + last.span === index + 1) last.span++;
			else runs.push({ start: index + 1, span: 1 });
		});
		return runs;
	});
	function describeDay(column: ForecastColumn): string {
		const day = column.isToday ? `Today, ${longDay(column.date)}` : longDay(column.date);
		const duty = column.isDutyDay ? 'Duty day.' : `Not a duty day: ${column.offDutyLabel}.`;
		const out = column.byStatus.map((entry) => `${band.statusById.get(entry.statusTypeId)?.name} ${entry.count}`);
		return [
			`${day}: ${column.available} of ${column.assigned} available.`,
			duty,
			column.belowFloor && 'Below the floor.',
			out.length > 0 && `Out: ${out.join(', ')}.`
		]
			.filter(Boolean)
			.join(' ');
	}
	const floorOffset = $derived(Math.round(BAR_HEIGHT * (1 - Math.min(band.floorPercent, 100) / 100)));

	// A narrow screen scrolls the days sideways; the fade says more days wait past the edge.
	let scroller = $state<HTMLDivElement>();
	let moreDays = $state(false);
	function measure() {
		if (scroller) moreDays = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
	}
	$effect(() => {
		if (!scroller) return;
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		return () => observer.disconnect();
	});
</script>

<div class="grid grid-cols-[minmax(0,1fr)] gap-[18px]">
	<div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
		<p class="font-heading text-[26px] leading-7 font-bold">{headline}</p>
		<Button variant="link" size="none" class="underline" href={calendarHref} onclick={onOpenCalendar}
			>Open calendar</Button
		>
	</div>

	<div class="relative">
		<div bind:this={scroller} class="overflow-x-auto" onscroll={measure}>
			<div class="grid min-w-[480px] gap-2">
				<div class="grid grid-cols-14 gap-x-1.5" style:grid-template-rows="auto {BAR_HEIGHT}px auto">
					{#each flaggedRuns as run (run.start)}
						<div
							class="row-span-3 row-start-1 rounded-t-[3px] bg-accent/12"
							style:grid-column="{run.start} / span {run.span}"
							aria-hidden="true"
						></div>
					{/each}
					{#each band.forecast as column, index (column.date)}
						{@const tone = column.belowFloor ? 'flagged' : column.isToday ? 'today' : column.isDutyDay ? 'duty' : 'off'}
						{#if tone === 'today'}
							<div
								class="row-span-2 row-start-1 rounded-t-[3px] bg-muted"
								style:grid-column={index + 1}
								aria-hidden="true"
							></div>
						{/if}
						<span
							role="img"
							aria-label={describeDay(column)}
							class={[
								'relative row-start-1 pt-2 pb-1.5 text-center font-heading text-xl leading-5',
								tone === 'flagged' && 'font-extrabold text-accent-text',
								tone === 'today' && 'font-extrabold text-foreground',
								tone === 'duty' && 'font-bold text-secondary-foreground',
								tone === 'off' && 'font-bold text-muted-foreground'
							]}
							style:grid-column={index + 1}
						>
							<span aria-hidden="true">{column.available}</span>
						</span>
						<span
							class="relative row-start-2 mx-1.5 flex flex-col gap-px"
							style:grid-column={index + 1}
							aria-hidden="true"
						>
							{#each column.byStatus as entry (entry.statusTypeId)}
								<span
									class={['rounded-[1px]', !column.isDutyDay && 'opacity-50']}
									style:flex="{entry.count} 1 0"
									style:background-color={band.statusById.get(entry.statusTypeId)?.color}
								></span>
							{/each}
							{#if column.available > 0}
								<span
									class={[
										'rounded-[1px]',
										column.isToday
											? 'bg-foreground'
											: column.isDutyDay
												? 'bg-muted-foreground/45'
												: 'bg-muted-foreground/20'
									]}
									style:flex="{column.available} 1 0"
								></span>
							{/if}
						</span>
						<span
							class={[
								'relative row-start-3 pt-2 pb-1 text-center font-mono text-[11px] leading-[14px]',
								tone === 'flagged'
									? 'font-semibold text-accent-text'
									: tone === 'today'
										? 'font-semibold text-foreground'
										: 'text-muted-foreground'
							]}
							style:grid-column={index + 1}
							aria-hidden="true"
						>
							{labels[index]}
						</span>
					{/each}
					<div class="relative col-span-full row-start-2 self-end border-b border-foreground" aria-hidden="true"></div>
					<div
						class="pointer-events-none relative col-span-full row-start-2 self-start border-t-[1.5px] border-dashed border-foreground"
						style:margin-top="{floorOffset}px"
						aria-hidden="true"
					></div>
				</div>
				{@render lanes?.()}
			</div>
		</div>
		{#if moreDays}
			<div
				class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-background"
				aria-hidden="true"
			></div>
		{/if}
	</div>

	<ul class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] leading-[14px] text-muted-foreground">
		{#each band.legend as statusType (statusType.id)}
			<li class="flex items-center gap-[5px]">
				<span class="size-2 rounded-[2px]" style:background-color={statusType.color} aria-hidden="true"></span>
				{statusType.name}
			</li>
		{/each}
		<li class="flex items-center gap-[5px]">
			<span class="w-3.5 border-t-[1.5px] border-dashed border-foreground" aria-hidden="true"></span>
			{band.floorPercent}% floor
		</li>
		{@render laneLegend?.()}
	</ul>
</div>
