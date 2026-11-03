<script lang="ts">
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import * as ReadinessBand from '$lib/components/patterns/readiness-band/index.js';
	import { showSubGroups } from '$lib/stores/showSubGroups.svelte';
	import type { ToolbarAction } from '$lib/components/patterns/workspace-toolbar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatWeekdayDayMonth } from '$lib/utils/dates';
	import { computeAvailabilityBoard } from '../../utils/availabilityBoard';
	import AvailabilityBottomLine from './AvailabilityBottomLine.svelte';
	import AvailabilityGroupGrid from './AvailabilityGroupGrid.svelte';
	import AvailabilityStrengthChart from './AvailabilityStrengthChart.svelte';
	import AvailabilityWhoIsOut from './AvailabilityWhoIsOut.svelte';
	import { reportFeedKey } from './calendarReportFeed.svelte';
	import { exportAvailabilityWorkbook } from './calendarReportWorkbookExport';
	import type { LensProps } from './lensTypes';

	let { statusTypes, groups, filters, range, today, feed, onRetry }: LensProps = $props();

	const GRID_LEGEND = [
		{ tier: 'not-applicable', label: '80%+' },
		{ tier: 'caution', label: '50-79%' },
		{ tier: 'danger', label: 'Under 50' }
	] as const;

	let picked = $state<{ key: string; date: string } | null>(null);

	const currentKey = $derived(range ? reportFeedKey(range) : null);
	const data = $derived(feed.status === 'ready' && feed.key === currentKey ? feed.data : null);
	const failure = $derived(feed.status === 'error' && feed.key === currentKey ? feed.message : null);
	const board = $derived(
		data && range
			? computeAvailabilityBoard({
					personnel: filters.personnel,
					entries: data.entries,
					statusTypes,
					awayStatusTypeIds: filters.awayStatusTypeIds,
					groups,
					selectedRootIds: filters.selectedRootIds,
					includeUnassigned: filters.allGroupsSelected,
					startDate: range.start,
					endDate: range.end
				})
			: null
	);
	// The grid's rows do not depend on the data, so the skeleton holds the height the grid will take.
	const gridRows = $derived(
		range
			? computeAvailabilityBoard({
					personnel: filters.personnel,
					entries: [],
					statusTypes,
					awayStatusTypeIds: filters.awayStatusTypeIds,
					groups,
					selectedRootIds: filters.selectedRootIds,
					includeUnassigned: filters.allGroupsSelected,
					startDate: range.start,
					endDate: range.start
				}).readiness.sets.reduce((rows, set) => rows + 1 + (showSubGroups.current ? set.below.length : 0), 1)
			: 3
	);
	const pickedDate = $derived(picked && picked.key === currentKey ? picked.date : null);
	const selectedDay = $derived(board ? (board.days.find((day) => day.date === pickedDate) ?? board.lowest) : null);

	function select(date: string): void {
		if (currentKey) picked = { key: currentKey, date };
	}

	export function exportActions(): ToolbarAction[] {
		if (!board || !range || filters.personnel.length === 0) return [];
		const { start, end } = range;
		return [
			{
				kind: 'action',
				id: 'export-availability',
				label: 'Export availability',
				icon: 'download',
				onclick: () => exportAvailabilityWorkbook(board, statusTypes, groups, start, end)
			}
		];
	}
</script>

<ReportWorkspace.Root ariaLabel="Availability report" aria-busy={board === null && failure === null}>
	<p class="sr-only" role="status">{board === null && failure === null ? 'Loading availability' : ''}</p>
	{#if failure !== null}
		<ReportWorkspace.State
			state="error"
			title="Could not load availability"
			description={failure}
			role="alert"
			{onRetry}
		/>
	{:else if board !== null && filters.personnel.length === 0}
		<ReportWorkspace.State
			state="no-data"
			level={2}
			title="No personnel match these filters."
			description="Choose a Group or MOS to see availability."
		/>
	{:else}
		<div class="flex flex-col gap-10">
			<div class="grid gap-12 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
				<ReportWorkspace.Section variant="briefing" title="Bottom line">
					{#if board && board.lowest}
						<AvailabilityBottomLine {board} lowest={board.lowest} {statusTypes} {today} />
					{:else}
						<div class="min-h-[28rem] space-y-6" aria-hidden="true">
							<Skeleton class="h-[88px] w-56" />
							<Skeleton class="h-24 w-full" />
							<Skeleton class="h-36 w-full" />
						</div>
					{/if}
				</ReportWorkspace.Section>

				<ReportWorkspace.Section
					variant="briefing"
					eyebrow="When · daily strength"
					title="Who's here, and why the rest are out"
				>
					{#if board}
						<AvailabilityStrengthChart
							days={board.days}
							{statusTypes}
							selectedDate={selectedDay?.date ?? null}
							onSelect={select}
							ariaLabel="Daily strength"
						/>
					{:else}
						<Skeleton class="h-[22rem] w-full" aria-hidden="true" />
					{/if}
				</ReportWorkspace.Section>
			</div>

			<ReportWorkspace.Section
				variant="briefing"
				eyebrow="Where · group by day"
				title="Which sections run short, and when"
				description="Percent of each group here that day. Days at 80% or better stay blank, so only the shortfalls carry a number."
			>
				{#snippet actions()}
					<ReadinessBand.Legend palette="semantic" ariaLabel="Availability tiers" items={[...GRID_LEGEND]} />
				{/snippet}
				{#if board}
					<AvailabilityGroupGrid
						readiness={board.readiness}
						days={board.days}
						selectedDate={selectedDay?.date ?? null}
						onSelect={select}
					/>
				{:else}
					<Skeleton class="w-full" style="height: calc({gridRows} * 2.9rem + 2.5rem)" aria-hidden="true" />
				{/if}
			</ReportWorkspace.Section>

			<ReportWorkspace.Section
				variant="briefing"
				eyebrow={selectedDay ? `Who · ${formatWeekdayDayMonth(selectedDay.date)}` : 'Who · selected day'}
				title={selectedDay
					? `${selectedDay.unavailableCount} out on ${formatWeekdayDayMonth(selectedDay.date)}`
					: "Who's out"}
				description="Follows the day you pick in the chart or grid."
			>
				{#if selectedDay}
					<AvailabilityWhoIsOut day={selectedDay} {statusTypes} />
				{:else}
					<Skeleton class="h-24 w-full" aria-hidden="true" />
				{/if}
			</ReportWorkspace.Section>
		</div>
	{/if}
</ReportWorkspace.Root>
