<script lang="ts">
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import { showSubGroups } from '$lib/stores/showSubGroups.svelte';
	import type { ToolbarAction, ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { toDayNumber } from '$lib/utils/dayNumber';
	import {
		computeTimeAway,
		DEFAULT_FLAG_CHOICE,
		FLAG_CHOICES,
		flagDays,
		rankPeople,
		summarizeTimeAway,
		type FlagChoiceId,
		type PersonOrder
	} from '../../utils/timeAway';
	import { exportTimeAwayWorkbook } from './calendarReportWorkbookExport';
	import type { LensProps } from './lensTypes';
	import TimeAwayBottomLine from './TimeAwayBottomLine.svelte';
	import TimeAwayComposition from './TimeAwayComposition.svelte';
	import TimeAwayPeople, { ROWS_SHOWN } from './TimeAwayPeople.svelte';

	let { statusTypes, groups, filters, range, feedKey, feed, onRetry }: LensProps = $props();

	const FLAG_NOTES: Record<FlagChoiceId, string> = {
		sixth: 'a sixth of the span',
		quarter: 'a quarter of the span',
		third: 'a third of the span',
		half: 'half the span'
	};

	let flagChoice = $state<FlagChoiceId>(DEFAULT_FLAG_CHOICE);
	let order = $state<PersonOrder>('most');

	const data = $derived(feed.status === 'ready' && feed.key === feedKey ? feed.data : null);
	const failure = $derived(feed.status === 'error' && feed.key === feedKey ? feed.message : null);

	const input = $derived({
		personnel: filters.personnel,
		statusTypes,
		awayStatusTypeIds: filters.awayStatusTypeIds,
		groups,
		showSubGroups: showSubGroups.current,
		startDate: range?.start ?? '2000-01-01',
		endDate: range?.end ?? '2000-03-30'
	});
	const spanDays = $derived(range ? toDayNumber(range.end) - toDayNumber(range.start) + 1 : 90);
	const report = $derived(data && range ? computeTimeAway({ ...input, entries: data.entries }) : null);
	// The skeleton's shape depends on the people and Groups, not on the data, so it holds the height the sections take;
	// the rem figures were measured from the loaded sections at 390, 900 and 1280 px.
	const shape = $derived(report ?? computeTimeAway({ ...input, entries: [] }));
	const groupRows = $derived(shape.groups.reduce((rows, set) => rows + 1 + set.below.length, 0));
	const personRows = $derived(Math.min(shape.peopleCount, ROWS_SHOWN));

	const flag = $derived(flagDays(spanDays, flagChoice));
	const summary = $derived(report ? summarizeTimeAway(report, flag) : null);
	const ranked = $derived(report ? rankPeople(report.people, order) : []);
	const largest = $derived(report?.byStatus[0] ?? null);
	const largestName = $derived(statusTypes.find((status) => status.id === largest?.statusTypeId)?.name ?? 'Unknown');

	export function controls(): ToolbarItem[] {
		return [
			{
				kind: 'select',
				id: 'report-flag',
				label: 'Flag at',
				showLabel: true,
				options: FLAG_CHOICES.map((choice) => ({
					value: choice.id,
					label: `${flagDays(spanDays, choice.id)}+ days`,
					ariaLabel: `Flag at ${flagDays(spanDays, choice.id)} or more days`
				})),
				value: flagChoice,
				defaultValue: DEFAULT_FLAG_CHOICE,
				onValueChange: (value) => (flagChoice = value as FlagChoiceId)
			}
		];
	}

	export function exportActions(): ToolbarAction[] {
		if (!report || !range || filters.personnel.length === 0) return [];
		const { start, end } = range;
		const ready = report;
		const flagged = flag;
		return [
			{
				kind: 'action',
				id: 'export-time-away',
				label: 'Export time away',
				icon: 'download',
				onclick: () => exportTimeAwayWorkbook(ready, statusTypes, flagged, start, end)
			}
		];
	}
</script>

<ReportWorkspace.Root ariaLabel="Time away report" aria-busy={report === null && failure === null}>
	<p class="sr-only" role="status">{report === null && failure === null ? 'Loading time away' : ''}</p>
	{#if failure !== null}
		<ReportWorkspace.State
			state="error"
			title="Could not load time away"
			description={failure}
			role="alert"
			{onRetry}
		/>
	{:else if report !== null && filters.personnel.length === 0}
		<ReportWorkspace.State
			state="no-data"
			level={2}
			title="No personnel match these filters."
			description="Choose a Group or MOS to see time away."
		/>
	{:else}
		<div class="flex flex-col gap-10">
			<div class="grid gap-12 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
				<ReportWorkspace.Section variant="briefing" title="Bottom line">
					{#if report && summary && range}
						<TimeAwayBottomLine {report} {summary} {flag} {statusTypes} start={range.start} end={range.end} />
					{:else}
						<div class="min-h-[24.7rem] space-y-6" aria-hidden="true">
							<Skeleton class="h-[88px] w-56" />
							<Skeleton class="h-24 w-full" />
							<Skeleton class="h-36 w-full" />
						</div>
					{/if}
				</ReportWorkspace.Section>

				<ReportWorkspace.Section
					variant="briefing"
					eyebrow="What · where the days went"
					title={largest && report
						? `${largestName} is ${Math.round(largest.share * 100)}% of time away`
						: 'Where the days went'}
				>
					<!-- A short result, such as nobody away, keeps the skeleton height so the sections below do not move. -->
					<div
						class="min-h-[calc(21.2rem_+_var(--rows)*3.2rem)] md:min-h-[calc(15.3rem_+_var(--rows)*3.2rem)] lg:min-h-[calc(17rem_+_var(--rows)*3.2rem)]"
						style="--rows: {groupRows}"
					>
						{#if report}
							<TimeAwayComposition {report} {statusTypes} />
						{:else}
							<Skeleton class="min-h-[inherit] w-full" aria-hidden="true" />
						{/if}
					</div>
				</ReportWorkspace.Section>
			</div>

			<ReportWorkspace.Section
				variant="briefing"
				eyebrow="Who · by person"
				title={summary
					? summary.flagged > 0
						? `${summary.flagged} ${summary.flagged === 1 ? 'person was' : 'people were'} away ${flag} days or more`
						: `Nobody was away ${flag} days or more`
					: 'Who was away'}
			>
				{#snippet actions()}
					<ToggleGroup.Root
						type="single"
						size="sm"
						aria-label="Order people"
						bind:value={() => order, (next) => (order = next === 'least' ? 'least' : 'most')}
					>
						<ToggleGroup.Item value="most">Most away</ToggleGroup.Item>
						<ToggleGroup.Item value="least">Least away</ToggleGroup.Item>
					</ToggleGroup.Root>
				{/snippet}
				{#if report}
					<TimeAwayPeople
						people={ranked}
						spanDays={report.spanDays}
						{flag}
						flagNote={FLAG_NOTES[flagChoice]}
						{statusTypes}
					/>
				{:else}
					<Skeleton
						class="h-[calc(4.55rem_+_var(--rows)*6.5rem)] w-full md:h-[calc(11.1rem_+_var(--rows)*3.85rem)] lg:h-[calc(3.8rem_+_var(--rows)*3.85rem)]"
						style="--rows: {personRows}"
						aria-hidden="true"
					/>
				{/if}
			</ReportWorkspace.Section>
		</div>
	{/if}
</ReportWorkspace.Root>
