<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import type { AvailabilityEntry, SpecialDay } from '$features/calendar/contracts';
	import { getMonthDates, getMonthName, addMonths } from '$lib/utils/dates';
	import BarTrack from './calendar-bars/BarTrack.svelte';
	import type { AvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
	import { dayWindow } from '$lib/utils/dayNumber';
	import type { LabelPolicy } from '$lib/components/patterns/calendar-bars';
	import { buildCalendarDays } from '$features/calendar/utils/calendarRenderState';
	import { buildVirtualRowLayout, getVisibleVirtualRows } from '$features/calendar/utils/virtualRows';
	import { Button } from '$lib/components/ui/button';

	const MIN_DAY_PX = 10;
	const GROUP_ROW_HEIGHT = 18;
	const PERSON_ROW_HEIGHT = 30;
	const DEFAULT_VIEWPORT_HEIGHT = 720;
	const ROW_OVERSCAN_PX = PERSON_ROW_HEIGHT * 8;

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		startDate: Date;
		personnelByGroup: GroupData[];
		tracks: AvailabilityTracks;
		specialDays: SpecialDay[];
		onDateColumnClick?: (date: Date) => void;
		onOpenEntry?: (person: Personnel, entry: AvailabilityEntry, anchor: HTMLElement) => void;
		onOpenOverflow?: (person: Personnel, entryIds: readonly string[], anchor: HTMLElement) => void;
	}

	let { startDate, personnelByGroup, tracks, specialDays, onDateColumnClick, onOpenEntry, onOpenOverflow }: Props =
		$props();

	const viewStartDate = $derived(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
	let scrollAreaEl: HTMLDivElement;
	let rosterRowsEl: HTMLDivElement;
	let scrollTop = $state(0);
	let viewportHeight = $state(DEFAULT_VIEWPORT_HEIGHT);
	let rosterOffsetTop = $state(0);
	let scrollAreaWidth = $state(0);
	let personnelHeaderEl: HTMLDivElement;
	let personnelColumnWidth = $state(0);

	const months = $derived.by(() => {
		const result = [];
		for (let i = 0; i < 3; i++) {
			const monthDate = addMonths(viewStartDate, i);
			result.push({
				year: monthDate.getFullYear(),
				month: monthDate.getMonth(),
				name: getMonthName(monthDate.getMonth()),
				dates: getMonthDates(monthDate.getFullYear(), monthDate.getMonth())
			});
		}
		return result;
	});

	const days = $derived(
		buildCalendarDays(
			months.flatMap((month) => month.dates),
			specialDays
		)
	);
	const visibleDays = $derived(dayWindow(days[0].dateKey, days.length));
	const dayPx = $derived(Math.max(MIN_DAY_PX, Math.floor((scrollAreaWidth - personnelColumnWidth) / days.length)));
	const policy: LabelPolicy = $derived({ view: '3-month', dayPx });

	const rosterRows = $derived.by(() => {
		const rows: (
			| { type: 'group'; key: string; group: string; height: number }
			| { type: 'person'; key: string; person: Personnel; height: number }
		)[] = [];

		for (const grp of personnelByGroup) {
			if (grp.personnel.length === 0) continue;
			rows.push({
				type: 'group',
				key: `group:${grp.group}`,
				group: grp.group,
				height: GROUP_ROW_HEIGHT
			});

			for (const person of grp.personnel) {
				rows.push({
					type: 'person',
					key: `person:${person.id}`,
					person,
					height: PERSON_ROW_HEIGHT
				});
			}
		}

		return rows;
	});

	const rosterLayout = $derived.by(() => buildVirtualRowLayout(rosterRows));

	const visibleRosterRows = $derived.by(() =>
		getVisibleVirtualRows(rosterLayout.rows, scrollTop, viewportHeight, ROW_OVERSCAN_PX, rosterOffsetTop)
	);

	function getRosterOffsetTop() {
		if (!scrollAreaEl || !rosterRowsEl) return 0;

		const scrollAreaRect = scrollAreaEl.getBoundingClientRect();
		const rosterRect = rosterRowsEl.getBoundingClientRect();
		const hasBrowserGeometry =
			scrollAreaRect.height > 0 || rosterRect.height > 0 || scrollAreaRect.top !== 0 || rosterRect.top !== 0;

		if (hasBrowserGeometry) {
			return Math.max(0, rosterRect.top - scrollAreaRect.top + scrollAreaEl.scrollTop);
		}

		return rosterRowsEl.offsetTop;
	}

	function updateScrollMetrics() {
		if (!scrollAreaEl) return;

		scrollTop = scrollAreaEl.scrollTop;
		viewportHeight = scrollAreaEl.clientHeight || DEFAULT_VIEWPORT_HEIGHT;
	}

	function updateLayoutMetrics() {
		updateScrollMetrics();
		rosterOffsetTop = getRosterOffsetTop();
		scrollAreaWidth = scrollAreaEl.clientWidth;
		personnelColumnWidth = personnelHeaderEl.offsetWidth;
	}

	function handleScroll() {
		updateScrollMetrics();
	}

	// The observer's first callback reads geometry after layout, so mounting the view never forces one.
	$effect(() => {
		if (!scrollAreaEl) return;

		if (typeof ResizeObserver === 'undefined') {
			updateLayoutMetrics();
			return;
		}

		const observer = new ResizeObserver(() => {
			updateLayoutMetrics();
		});
		observer.observe(scrollAreaEl);
		if (rosterRowsEl) observer.observe(rosterRowsEl);

		return () => observer.disconnect();
	});
</script>

<div
	class="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground [--calendar-personnel-column-width:160px] max-[641px]:[--calendar-personnel-column-width:120px]"
	style:--dates-count={days.length}
>
	<div
		class="scroll-area flex-1 overflow-auto bg-card [scrollbar-gutter:stable]"
		bind:this={scrollAreaEl}
		onscroll={handleScroll}
	>
		<div
			class="flex min-w-[calc(var(--calendar-personnel-column-width)+10px*var(--dates-count))] flex-col [--long-range-columns:var(--calendar-personnel-column-width)_repeat(var(--dates-count),minmax(10px,1fr))]"
		>
			<div class="sticky top-0 z-10 grid [grid-template-columns:var(--long-range-columns)] border-b bg-muted">
				<div
					bind:this={personnelHeaderEl}
					class="sticky left-0 z-20 flex min-h-9 items-center border-r bg-muted px-3 py-2 font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase"
				>
					Personnel
				</div>
				{#each months as month (`${month.year}-${month.month}`)}
					<div
						class="flex min-h-9 min-w-0 items-center overflow-hidden border-l px-1.5 py-2 font-mono text-xs font-semibold tracking-widest whitespace-nowrap text-foreground uppercase"
						style:grid-column="span {month.dates.length}"
					>
						{month.name}
						{month.year}
					</div>
				{/each}
			</div>

			<div class="sticky top-9 z-[9] grid [grid-template-columns:var(--long-range-columns)] border-b bg-card">
				<div class="sticky left-0 z-10 min-h-8 border-r bg-card px-3"></div>
				{#each days as day, index (day.dateKey)}
					{@const month = months.find((item) => item.month === day.date.getMonth())}
					<Button
						variant="cell"
						size="none"
						class={[
							'h-8 min-w-0 justify-start overflow-visible bg-card px-0.5 text-muted-foreground max-sm:h-9',
							day.date.getDay() === 1 && 'border-l border-border',
							day.weekend && 'bg-muted/55',
							day.today && 'z-[1] bg-primary/10 inset-ring inset-ring-primary',
							day.specialDay?.type === 'federal-holiday' && 'bg-warning-muted/55'
						]}
						aria-label={day.dateLabel}
						title={day.specialDay?.name ?? `Jump to ${month?.name} ${month?.year}`}
						onclick={() => onDateColumnClick?.(day.date)}
					>
						{#if day.date.getDay() === 1 || index === 0}
							<span class="relative z-[2] font-mono text-[9px] font-semibold whitespace-nowrap">{day.dayOfMonth}</span>
						{/if}
					</Button>
				{/each}
			</div>

			<div class="roster-rows relative" bind:this={rosterRowsEl} style:height={`${rosterLayout.totalHeight}px`}>
				<div class="absolute inset-0 grid [grid-template-columns:var(--long-range-columns)]" aria-hidden="true">
					<div></div>
					{#each days as day (day.dateKey)}
						<div
							class={[
								day.date.getDay() === 1 && 'border-l border-border',
								day.weekend && 'bg-muted/55',
								day.specialDay?.type === 'federal-holiday' && 'bg-warning-muted/55',
								day.today && 'bg-primary/10'
							]}
						></div>
					{/each}
				</div>
				{#each visibleRosterRows as row (row.key)}
					<div
						class="virtual-row absolute top-0 left-0 w-full"
						style:transform={`translateY(${row.top}px)`}
						style:height={`${row.height}px`}
					>
						{#if row.type === 'group'}
							<div class="flex h-full overflow-clip bg-muted">
								<div
									class="sticky left-0 z-[2] flex h-full w-[var(--calendar-personnel-column-width)] shrink-0 items-center border-r bg-muted px-3 font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase"
								>
									{row.group}
								</div>
							</div>
						{:else}
							<div
								class="relative grid h-full [grid-template-columns:var(--long-range-columns)] border-b"
								data-person-id={row.person.id}
							>
								<div class="sticky left-0 z-[2] flex h-full items-center gap-1 border-r bg-card px-3 text-sm">
									<span class="font-mono text-xs font-semibold tracking-wider text-primary uppercase"
										>{row.person.rank}</span
									>
									<span class="overflow-hidden text-ellipsis whitespace-nowrap text-foreground"
										>{row.person.lastName}</span
									>
								</div>
								<BarTrack
									layout={tracks.layout(row.person.id, visibleDays, policy)}
									personLabel="{row.person.rank} {row.person.lastName}, {row.person.firstName}"
									size="compact"
									onOpenEntry={onOpenEntry && ((entry, anchor) => onOpenEntry(row.person, entry, anchor))}
									onOpenOverflow={onOpenOverflow &&
										((entryIds, anchor) => onOpenOverflow(row.person, entryIds, anchor))}
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
