<script lang="ts">
	import { MarkerListPopover } from '$features/calendar';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { DashboardPageUpdates } from '../dashboardPageUpdates';
	import {
		LANE_ROWS,
		type DashboardForecastLaneView,
		type ForecastLaneMark,
		type PlacedLaneMark
	} from '../sections/forecastLanes';

	let {
		days,
		lanes,
		updates
	}: { days: readonly string[]; lanes: readonly DashboardForecastLaneView[]; updates: DashboardPageUpdates } = $props();

	const ROW = 22;
	const GAP = 4;
	const HEIGHT = LANE_ROWS * ROW + (LANE_ROWS - 1) * GAP;
	const focus = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
	const chip = `flex shrink-0 items-center rounded-sm border border-dashed border-muted-foreground px-1 font-mono text-[11px] leading-none font-semibold text-foreground ${focus}`;

	/** A span too short for its title shows the title beside it, in the free days that follow. */
	function titleBeside(mark: PlacedLaneMark): boolean {
		return mark.kind === 'span' && mark.span < 3 && mark.room > 0 && mark.more.length === 0;
	}

	function counted(lane: DashboardForecastLaneView, kind: ForecastLaneMark['kind'], count: number, more = false) {
		const entry = lane.legend.find((legend) => legend.kind === kind);
		const noun = entry && (count === 1 ? entry.label : entry.plural);
		return [count, more && 'more', noun].filter(Boolean).join(' ');
	}

	function listed(mark: PlacedLaneMark) {
		return [mark, ...mark.more].map(({ id, title, detail, href }) => ({ key: id, title, detail, href }));
	}

	const titles = (marks: readonly ForecastLaneMark[]) => marks.map((mark) => mark.title).join(', ');
</script>

{#snippet more(lane: DashboardForecastLaneView, mark: PlacedLaneMark, className: string)}
	<MarkerListPopover
		label={`${counted(lane, mark.kind, mark.more.length, true)}: ${titles(mark.more)}`}
		heading={counted(lane, mark.kind, mark.more.length + 1)}
		items={listed(mark)}
		class={className}
	>
		+{mark.more.length}
	</MarkerListPopover>
{/snippet}

{#each lanes as lane (lane.id)}
	<div class="border-t border-border pt-2" style:height="{HEIGHT + 9}px" data-forecast-lane={lane.id}>
		{#if lane.read.state === 'ready' && lane.read.marks.length > 0}
			<ul
				class="grid gap-x-1.5"
				style:row-gap="{GAP}px"
				style:grid-template-columns="repeat({days.length}, minmax(0, 1fr))"
				style:grid-template-rows="repeat({LANE_ROWS}, {ROW}px)"
				aria-label={lane.label}
			>
				{#each lane.read.marks as mark (mark.id)}
					{@const beside = titleBeside(mark)}
					{@const columns = mark.span + (beside ? mark.room : 0)}
					<li class="flex min-w-0 gap-1" style:grid-column="{mark.column} / span {columns}" style:grid-row={mark.row}>
						{#if mark.kind === 'span' && mark.span === 1 && mark.more.length > 0}
							<MarkerListPopover
								label={`${counted(lane, mark.kind, mark.more.length + 1)}: ${titles([mark, ...mark.more])}`}
								heading={counted(lane, mark.kind, mark.more.length + 1)}
								items={listed(mark)}
								class="{chip} w-full justify-center"
							>
								{mark.more.length + 1}
							</MarkerListPopover>
						{:else if mark.kind === 'span'}
							<a
								href={mark.href}
								aria-label={mark.label}
								title={mark.label}
								class="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[3px] text-[13px] leading-[22px] no-underline {focus}"
							>
								<span
									aria-hidden="true"
									class={[
										'block h-full shrink-0 truncate rounded-[3px] px-2',
										mark.emphasis === 'strong' && 'bg-foreground font-semibold text-background',
										mark.emphasis === 'quiet' && 'border border-border bg-muted text-muted-foreground italic',
										mark.emphasis === 'cancelled' &&
											'border border-dashed border-border text-muted-foreground line-through'
									]}
									style:width="calc((100% + 6px) * {mark.span / columns} - 6px)"
								>
									{beside ? '' : mark.title}
								</span>
								{#if beside}
									<span
										aria-hidden="true"
										class={[
											'min-w-0 truncate',
											mark.emphasis === 'cancelled' ? 'text-muted-foreground line-through' : 'text-foreground'
										]}
									>
										{mark.title}
									</span>
								{/if}
							</a>
							{#if mark.more.length > 0}
								{@render more(lane, mark, chip)}
							{/if}
						{:else}
							<a
								href={mark.href}
								aria-label={mark.label}
								title={mark.label}
								class="flex h-full min-w-0 flex-1 items-center justify-center rounded-[3px] {focus}"
							>
								<span class="size-2.5 shrink-0 rotate-45 bg-foreground" aria-hidden="true"></span>
							</a>
							{#if mark.more.length > 0}
								{@render more(lane, mark, `${chip} h-4 self-center px-0.5 text-[10px]`)}
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{:else if lane.read.state === 'ready'}
			<p class="text-[13px] leading-[22px] text-muted-foreground">{lane.empty}</p>
		{:else if lane.read.state === 'pending'}
			<div class="grid" style:row-gap="{GAP}px" style:grid-auto-rows="{ROW}px" aria-busy="true">
				<Skeleton class="h-full w-[45%]" aria-hidden="true" />
				<Skeleton class="ml-[55%] h-full w-[30%]" aria-hidden="true" />
				<Skeleton class="ml-[20%] h-full w-[50%]" aria-hidden="true" />
				<span class="sr-only">Loading {lane.label.toLowerCase()}</span>
			</div>
		{:else}
			{@const retry = lane.read.retry}
			<p class="flex flex-wrap items-center gap-x-2 text-[13px] leading-[22px] text-destructive-text">
				{lane.label} could not load.
				<Button variant="link" size="none" class="text-[13px] underline" onclick={() => retry(updates)}>
					Try again
				</Button>
			</p>
		{/if}
	</div>
{/each}
