<script lang="ts">
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import type { ToolbarAction, ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { computeAssignmentLoad, dutyTypes, OVER_FLAG, rankLoad, type LoadOrder } from '../../utils/assignmentLoad';
	import AssignmentLoadBottomLine from './AssignmentLoadBottomLine.svelte';
	import AssignmentLoadDuties from './AssignmentLoadDuties.svelte';
	import AssignmentLoadPeople, { ROWS_SHOWN } from './AssignmentLoadPeople.svelte';
	import { exportAssignmentLoadWorkbook } from './calendarReportWorkbookExport';
	import type { LensProps } from './lensTypes';

	let { personnel, groups, rankCatalog, filters, range, feedKey, feed, onRetry }: LensProps = $props();

	let order = $state<LoadOrder>('over');
	// Kept as the types switched off, so every type, including one that first appears in a later span, starts counted.
	let excludedTypeIds = $state<string[]>([]);

	const data = $derived(feed.status === 'ready' && feed.key === feedKey ? feed.data : null);
	const failure = $derived(feed.status === 'error' && feed.key === feedKey ? feed.message : null);

	const allTypes = $derived(
		data && range ? dutyTypes(data.assignmentTypes ?? [], data.assignments ?? [], range.start, range.end) : []
	);
	const typeIds = $derived(new Set(allTypes.map((type) => type.id).filter((id) => !excludedTypeIds.includes(id))));
	const report = $derived(
		data && range
			? computeAssignmentLoad({
					roster: personnel,
					shown: filters.personnel,
					assignments: data.assignments ?? [],
					assignmentTypes: data.assignmentTypes ?? [],
					excusals: data.excusals ?? [],
					poolSpans: data.poolSpans ?? [],
					typeIds,
					entries: data.entries,
					awayStatusTypeIds: filters.awayStatusTypeIds,
					rankCatalog,
					groups,
					startDate: range.start,
					endDate: range.end
				})
			: null
	);
	const ranked = $derived(report ? rankLoad(report.people, order) : []);
	const personRows = $derived(Math.min(filters.personnel.length, ROWS_SHOWN));

	export function controls(): ToolbarItem[] {
		if (allTypes.length === 0) return [];
		return [
			{
				kind: 'multiSelect',
				id: 'report-duty-types',
				label: 'Duty types',
				options: allTypes.map((type) => ({ value: type.id, label: type.name })),
				values: [...typeIds],
				defaultValues: allTypes.map((type) => type.id),
				onValuesChange: (values) =>
					(excludedTypeIds = allTypes.map((type) => type.id).filter((id) => !values.includes(id)))
			}
		];
	}

	export function exportActions(): ToolbarAction[] {
		if (!report || !range || report.people.length === 0) return [];
		const ready = report;
		const { start, end } = range;
		return [
			{
				kind: 'action',
				id: 'export-assignment-load',
				label: 'Export assignment load',
				icon: 'download',
				onclick: () => exportAssignmentLoadWorkbook(ready, start, end)
			}
		];
	}
</script>

<ReportWorkspace.Root ariaLabel="Assignment load report" aria-busy={report === null && failure === null}>
	<p class="sr-only" role="status">{report === null && failure === null ? 'Loading assignment load' : ''}</p>
	{#if failure !== null}
		<ReportWorkspace.State
			state="error"
			title="Could not load assignment load"
			description={failure}
			role="alert"
			{onRetry}
		/>
	{:else if report !== null && allTypes.length === 0}
		<ReportWorkspace.State
			state="no-data"
			level={2}
			title="No duties were assigned to people in this span."
			description="Assign a person-assigned duty on the calendar, or look at a longer span."
		/>
	{:else if report !== null && typeIds.size === 0}
		<ReportWorkspace.State
			state="no-data"
			level={2}
			title="No duty types are chosen."
			description="Choose a duty type to see how its load is shared."
		/>
	{:else if report !== null && filters.personnel.length === 0}
		<ReportWorkspace.State
			state="no-data"
			level={2}
			title="No personnel match these filters."
			description="Choose a Group or MOS to see assignment load."
		/>
	{:else if report !== null && report.people.length === 0}
		<ReportWorkspace.State
			state="no-data"
			level={2}
			title="Nobody here shared a duty in this span."
			description="None of these people was eligible for a duty on a day it was assigned."
		/>
	{:else}
		<div class="flex flex-col gap-10">
			<div class="grid gap-12 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
				<ReportWorkspace.Section variant="briefing" title="Bottom line">
					<!-- A short result keeps the skeleton height so the sections below do not move. -->
					<div class="min-h-[24.7rem] lg:min-h-[26.325rem]">
						{#if report && range}
							<AssignmentLoadBottomLine {report} start={range.start} end={range.end} />
						{:else}
							<div class="space-y-6" aria-hidden="true">
								<Skeleton class="h-[88px] w-56" />
								<Skeleton class="h-24 w-full" />
								<Skeleton class="h-36 w-full" />
							</div>
						{/if}
					</div>
				</ReportWorkspace.Section>

				<ReportWorkspace.Section variant="briefing" eyebrow="How · spread of each duty" title="How each duty is spread">
					<div class="min-h-[14.35rem] md:min-h-[11.06rem] lg:min-h-[18rem]">
						{#if report}
							<AssignmentLoadDuties {report} />
						{:else}
							<Skeleton class="min-h-[inherit] w-full" aria-hidden="true" />
						{/if}
					</div>
				</ReportWorkspace.Section>
			</div>

			<ReportWorkspace.Section
				variant="briefing"
				eyebrow="Who · by person"
				title={report
					? report.summary.overFlagged > 0
						? `${report.summary.overFlagged} ${report.summary.overFlagged === 1 ? 'person is' : 'people are'} ${OVER_FLAG} or more duties over their share`
						: `Nobody is ${OVER_FLAG} or more duties over their share`
					: 'Who carries the duty'}
			>
				{#snippet actions()}
					<ToggleGroup.Root
						type="single"
						size="sm"
						aria-label="Order people"
						bind:value={() => order, (next) => (order = next === 'under' ? 'under' : 'over')}
					>
						<ToggleGroup.Item value="over">Most over</ToggleGroup.Item>
						<ToggleGroup.Item value="under">Most under</ToggleGroup.Item>
					</ToggleGroup.Root>
				{/snippet}
				{#if report}
					<AssignmentLoadPeople people={ranked} dutyTypes={report.dutyTypes} />
				{:else}
					<Skeleton
						class="h-[calc(2.27rem_+_var(--rows)*7.78rem)] w-full md:h-[calc(4.87rem_+_var(--rows)*5.03rem)] lg:h-[calc(3.86rem_+_var(--rows)*5.03rem)]"
						style="--rows: {personRows}"
						aria-hidden="true"
					/>
				{/if}
			</ReportWorkspace.Section>
		</div>
	{/if}
</ReportWorkspace.Root>
