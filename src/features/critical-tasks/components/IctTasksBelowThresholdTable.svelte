<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import type { IctTaskBelowThresholdRow } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		rows: IctTaskBelowThresholdRow[];
		thresholdPercent: number;
		loading?: boolean;
	}

	const VISIBLE_ROW_LIMIT = 10;

	let { rows, thresholdPercent, loading = false }: Props = $props();
	let expanded = $state(false);

	const visibleRows = $derived(expanded ? rows : rows.slice(0, VISIBLE_ROW_LIMIT));
	const hasOverflow = $derived(rows.length > VISIBLE_ROW_LIMIT);
	const toggleLabel = $derived(
		expanded ? `Show top ${VISIBLE_ROW_LIMIT} tasks below threshold` : `Show all ${rows.length} tasks below threshold`
	);
	const columns: ColumnDef<IctTaskBelowThresholdRow>[] = [
		{
			key: 'task',
			header: 'Task',
			value: (row) => `${row.taskCode} ${row.taskName}`,
			compare: (a, b) => a.taskCode.localeCompare(b.taskCode) || a.taskName.localeCompare(b.taskName)
		},
		{
			key: 'percent',
			header: 'Complete',
			value: (row) => row.percentComplete,
			align: 'right',
			compare: (a, b) => a.percentComplete - b.percentComplete
		},
		{
			key: 'gap',
			header: 'Gap',
			value: (row) => row.soldierGapCount,
			align: 'right',
			compare: (a, b) => b.soldierGapCount - a.soldierGapCount
		}
	];
</script>

{#snippet cell(row: IctTaskBelowThresholdRow, column: ColumnDef<IctTaskBelowThresholdRow>)}
	{#if column.key === 'task'}
		<span class="grid gap-0.5">
			<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				{row.taskCode}
			</span>
			<span class="font-medium text-foreground">{row.taskName}</span>
		</span>
	{:else if column.key === 'percent'}
		<span class="font-mono font-semibold">{row.percentComplete}%</span>
	{:else}
		<span class="font-mono font-semibold">{row.soldierGapCount}</span>
	{/if}
{/snippet}

{#snippet footer()}
	{#if hasOverflow}
		<div class="flex justify-end border-t border-border p-2">
			<Button
				variant="outline"
				size="sm"
				aria-expanded={expanded ? 'true' : 'false'}
				onclick={() => (expanded = !expanded)}
			>
				{toggleLabel}
			</Button>
		</div>
	{/if}
{/snippet}

<ReportWorkspace.Section
	title="Tasks Below Unit Threshold"
	meta={`<${thresholdPercent}% complete`}
	aria-busy={loading ? 'true' : 'false'}
>
	{#if rows.length === 0}
		<ReportWorkspace.State
			state="no-data"
			title="No tasks below threshold"
			description={`No tasks are below ${thresholdPercent}% for the active filters.`}
		/>
	{:else}
		<DataTable.DataTable
			data={visibleRows}
			{columns}
			ariaLabel="Tasks below unit threshold"
			emptyMessage={`No tasks are below ${thresholdPercent}% for the active filters.`}
			{loading}
			density="dense"
			stickyHeader
			rowKey={(row) => row.taskId}
			{cell}
			footer={hasOverflow ? footer : undefined}
		/>
	{/if}
</ReportWorkspace.Section>
