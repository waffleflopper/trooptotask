<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import type {
		Personnel,
		AvailabilityEntry,
		StatusType,
		SpecialDay,
		AssignmentType,
		DailyAssignment
	} from '$lib/types';
	import { formatDate, getMonthDates, getMonthName, addMonths } from '$lib/utils/dates';
	import { exportQuarterToExcel, printQuarterCalendar } from '../utils/calendarExport';
	import CalendarNavigation from './CalendarNavigation.svelte';
	import { buildCalendarRenderState } from '$features/calendar/utils/calendarRenderState';
	import { buildVirtualRowLayout, getVisibleVirtualRows } from '$features/calendar/utils/virtualRows';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { Button } from '$lib/components/ui/button';
	import { toastStore } from '$lib/stores/toast.svelte';

	/** Must match --long-range-col-width in CSS */
	const COL_WIDTH = 24;
	const GROUP_ROW_HEIGHT = 18;
	const PERSON_ROW_HEIGHT = 22;
	const DEFAULT_VIEWPORT_HEIGHT = 720;
	const ROW_OVERSCAN_PX = PERSON_ROW_HEIGHT * 8;

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		startDate: Date;
		personnelByGroup: GroupData[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		groups?: readonly Group[];
		onDateColumnClick?: (date: Date) => void;
		onToggleViewMode?: () => void;
	}

	let {
		startDate,
		personnelByGroup,
		availabilityEntries,
		statusTypes,
		specialDays,
		assignmentTypes,
		assignments,
		groups = [],
		onDateColumnClick,
		onToggleViewMode
	}: Props = $props();

	let viewStartDate = $derived(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
	let scrollAreaEl: HTMLDivElement;
	let rosterRowsEl: HTMLDivElement;
	let scrollTop = $state(0);
	let viewportHeight = $state(DEFAULT_VIEWPORT_HEIGHT);
	let rosterOffsetTop = $state(0);

	// Get 3 months of data
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

	const visibleDates = $derived.by(() => months.flatMap((month) => month.dates));

	const renderState = $derived.by(() =>
		buildCalendarRenderState({
			dates: visibleDates,
			personnelByGroup,
			availabilityEntries,
			statusTypes,
			specialDays,
			assignmentTypes,
			assignments,
			groups
		})
	);

	const visibleDateKeys = $derived(renderState.dateKeys);

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

	const rosterWidth = $derived(
		`calc(var(--calendar-personnel-column-width) + ${visibleDateKeys.length * COL_WIDTH}px)`
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
	}

	function handleScroll() {
		updateScrollMetrics();
	}

	$effect(() => {
		if (!scrollAreaEl) return;

		updateLayoutMetrics();

		if (typeof ResizeObserver === 'undefined') return;

		const observer = new ResizeObserver(() => {
			updateLayoutMetrics();
		});
		observer.observe(scrollAreaEl);
		if (rosterRowsEl) observer.observe(rosterRowsEl);

		return () => observer.disconnect();
	});

	function prevQuarter() {
		viewStartDate = addMonths(viewStartDate, -3);
	}

	function nextQuarter() {
		viewStartDate = addMonths(viewStartDate, 3);
	}

	function goToToday() {
		viewStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
	}

	function goToMonth(year: number, month: number) {
		viewStartDate = new Date(year, month, 1);
	}

	function handleExportExcel() {
		exportQuarterToExcel(viewStartDate, {
			personnelByGroup,
			availabilityEntries,
			statusTypes,
			specialDays,
			assignmentTypes,
			assignments
		});
	}

	async function handleExportPDF() {
		try {
			await printQuarterCalendar(viewStartDate, {
				personnelByGroup,
				availabilityEntries,
				statusTypes,
				specialDays,
				assignmentTypes,
				assignments
			});
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'PDF export failed');
		}
	}
</script>

<div
	class="long-range-wrapper flex flex-1 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground [--long-range-col-width:24px] [--long-range-header-height:36px]"
	style="
		--calendar-personnel-column-width: 200px;
		--long-range-group-row-height: {GROUP_ROW_HEIGHT}px;
		--long-range-person-row-height: {PERSON_ROW_HEIGHT}px;
	"
>
	<CalendarNavigation
		title={`${months[0].name} ${months[0].year} – ${months[2].name} ${months[2].year}`}
		onPrev={prevQuarter}
		onNext={nextQuarter}
		onGoToToday={goToToday}
		viewMode="3-month"
		{onToggleViewMode}
		prevLabel="Prev 3 Months"
		nextLabel="Next 3 Months"
		titleTestId="long-range-date-label"
		pickerYear={viewStartDate.getFullYear()}
		pickerMonth={viewStartDate.getMonth()}
		onSelectMonthYear={goToMonth}
	/>

	<div
		class="scroll-area flex-1 overflow-auto bg-card [scrollbar-gutter:stable]"
		bind:this={scrollAreaEl}
		onscroll={handleScroll}
	>
		<div class="flex min-w-max flex-col">
			<!-- Header Row with Months and Days -->
			<div class="sticky top-0 z-10 flex border-b bg-muted">
				<div
					class="sticky left-0 z-20 flex min-h-[var(--long-range-header-height)] w-[var(--calendar-personnel-column-width)] shrink-0 items-center border-r bg-muted px-3 py-2 font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase"
				>
					Personnel
				</div>
				{#each months as month (`${month.year}-${month.month}`)}
					<div
						class="flex min-h-[var(--long-range-header-height)] shrink-0 items-center justify-center border-l px-0 py-2 text-center font-mono text-xs font-semibold tracking-widest text-foreground uppercase first:border-l-0"
						style="width: {month.dates.length * COL_WIDTH}px; min-width: {month.dates.length * COL_WIDTH}px;"
					>
						{month.name}
						{month.year}
					</div>
				{/each}
			</div>

			<!-- Day Numbers Row — clickable to jump to that month -->
			<div class="sticky top-[var(--long-range-header-height)] z-[9] flex border-b bg-card">
				<div
					class="sticky left-0 z-10 min-h-8 w-[var(--calendar-personnel-column-width)] shrink-0 border-r bg-card px-3"
				></div>
				{#each months as month (`${month.year}-${month.month}`)}
					{#each month.dates as date (formatDate(date))}
						{@const dateKey = formatDate(date)}
						{@const header = renderState.headerCell(dateKey)}
						<button
							class={[
								'flex h-8 w-[var(--long-range-col-width)] shrink-0 cursor-pointer flex-col items-center justify-center border-l bg-card text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-ring focus-visible:z-[2] focus-visible:ring-2 focus-visible:outline-none max-sm:h-9 max-sm:w-7 max-sm:min-w-7 max-sm:max-w-7',
								header?.weekend && 'bg-muted/55',
								header?.today && 'z-[1] bg-primary/10 shadow-[inset_0_0_0_1px_var(--primary)]',
								header?.specialDay?.type === 'federal-holiday' && 'bg-warning-muted/55'
							]}
							title={header?.specialDay?.name ?? `Jump to ${month.name} ${month.year}`}
							onclick={() => onDateColumnClick?.(date)}
						>
							<span class="font-mono text-[9px] font-semibold sm:text-xs">{date.getDate()}</span>
						</button>
					{/each}
				{/each}
			</div>

			<!-- Personnel Rows (read-only) -->
			<div
				class="roster-rows relative min-w-max"
				bind:this={rosterRowsEl}
				style:height={`${rosterLayout.totalHeight}px`}
				style:width={rosterWidth}
			>
				{#each visibleRosterRows as row (row.key)}
					<div
						class="virtual-row absolute top-0 left-0"
						style:transform={`translateY(${row.top}px)`}
						style:height={`${row.height}px`}
					>
						{#if row.type === 'group'}
							<div class="flex h-[var(--long-range-group-row-height)] overflow-hidden bg-muted/70">
								<div
									class="sticky left-0 z-[2] flex h-[var(--long-range-group-row-height)] w-[var(--calendar-personnel-column-width)] shrink-0 items-center border-r bg-muted/70 px-3 font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase"
								>
									{row.group}
								</div>
								{#each months as month (`${month.year}-${month.month}`)}
									{#each month.dates as date (formatDate(date))}
										<div
											class="h-[var(--long-range-group-row-height)] w-[var(--long-range-col-width)] shrink-0 border-l bg-muted/70 max-sm:w-7 max-sm:min-w-7 max-sm:max-w-7"
										></div>
									{/each}
								{/each}
							</div>
						{:else}
							<div
								class="flex h-[var(--long-range-person-row-height)] overflow-hidden border-b hover:[&_.empty-status-cell]:bg-muted"
							>
								<div
									class="sticky left-0 z-[2] flex h-[var(--long-range-person-row-height)] w-[var(--calendar-personnel-column-width)] shrink-0 items-center gap-1 border-r bg-card px-3 text-sm"
								>
									<span class="font-mono text-xs font-semibold tracking-wider text-primary uppercase"
										>{row.person.rank}</span
									>
									<span class="overflow-hidden text-ellipsis whitespace-nowrap text-foreground"
										>{row.person.lastName}</span
									>
								</div>
								{#each months as month (`${month.year}-${month.month}`)}
									{#each month.dates as date (formatDate(date))}
										{@const dateKey = formatDate(date)}
										{@const cell = renderState.personDateCell(row.person.id, dateKey)}
										{@const status = cell?.primaryStatus}
										<div
											class={[
												'status-cell relative flex h-[var(--long-range-person-row-height)] w-[var(--long-range-col-width)] shrink-0 items-center justify-center border-l bg-card transition-colors max-sm:h-8 max-sm:w-7 max-sm:min-w-7 max-sm:max-w-7',
												!status && 'empty-status-cell',
												cell?.weekend && 'bg-muted/55',
												cell?.today && 'z-[1] shadow-[inset_0_0_0_1px_var(--primary)]',
												status && 'has-status border-transparent'
											]}
											style={status ? `background-color: ${status.color}` : ''}
											title={cell?.title ?? ''}
										></div>
									{/each}
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 sm:px-5">
		<div class="hidden flex-wrap items-center gap-2 text-sm sm:flex">
			<span class="font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase">Status:</span>
			{#each statusTypes as status (status.id)}
				<span
					class="flex items-center gap-2 rounded-lg border bg-card px-2 py-1 font-mono text-xs tracking-wider text-muted-foreground uppercase"
				>
					<span
						class="size-2 rounded-[2px] shadow-[inset_0_0_0_1px_rgba(14,14,13,0.08)]"
						style="background-color: {status.color}"
					></span>
					{status.name}
				</span>
			{/each}
		</div>
		<div class="ml-auto flex shrink-0 items-center gap-2">
			<Button variant="outline" size="sm" onclick={handleExportExcel} title="Export to Excel">
				<FileSpreadsheetIcon aria-hidden="true" />
				Excel
			</Button>
			<Button variant="outline" size="sm" onclick={handleExportPDF} title="Print / PDF">
				<PrinterIcon aria-hidden="true" />
				PDF
			</Button>
		</div>
	</div>
</div>
