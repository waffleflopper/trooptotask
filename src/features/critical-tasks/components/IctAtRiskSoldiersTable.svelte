<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import type { IctAtRiskSoldierRow } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		rows: IctAtRiskSoldierRow[];
		expiringSoonWindowDays: number;
		loading?: boolean;
	}

	const VISIBLE_ROW_LIMIT = 10;

	let { rows, expiringSoonWindowDays, loading = false }: Props = $props();
	let expanded = $state(false);

	const expiringSoonColumnLabel = $derived(`Exp <=${expiringSoonWindowDays}d`);
	const visibleRows = $derived(expanded ? rows : rows.slice(0, VISIBLE_ROW_LIMIT));
	const hasOverflow = $derived(rows.length > VISIBLE_ROW_LIMIT);
	const toggleLabel = $derived(
		expanded ? `Show top ${VISIBLE_ROW_LIMIT} at-risk Soldiers` : `Show all ${rows.length} at-risk Soldiers`
	);

	const columns = $derived<ColumnDef<IctAtRiskSoldierRow>[]>([
		{
			key: 'soldier',
			header: 'Soldier',
			value: (row) => row.soldierName,
			compare: (a, b) => a.soldierName.localeCompare(b.soldierName) || a.personnelId.localeCompare(b.personnelId)
		},
		{
			key: 'mos',
			header: 'MOS',
			value: (row) => row.mos,
			compare: (a, b) => a.mos.localeCompare(b.mos) || a.soldierName.localeCompare(b.soldierName)
		},
		{
			key: 'readiness',
			header: '%',
			value: (row) => row.readinessPercent,
			align: 'right',
			compare: (a, b) => a.readinessPercent - b.readinessPercent
		},
		{
			key: 'expiring',
			header: expiringSoonColumnLabel,
			value: (row) => row.tasksExpiringSoonCount,
			align: 'right',
			compare: (a, b) => b.tasksExpiringSoonCount - a.tasksExpiringSoonCount
		},
		{
			key: 'lastUpdate',
			header: 'Last Update',
			value: (row) => formatDaysSinceUpdate(row.daysSinceLastIctUpdate),
			align: 'right',
			compare: (a, b) => compareNullableDays(a.daysSinceLastIctUpdate, b.daysSinceLastIctUpdate)
		}
	]);

	function compareNullableDays(left: number | null, right: number | null): number {
		if (left === null && right === null) return 0;
		if (left === null) return 1;
		if (right === null) return -1;
		return right - left;
	}

	function formatDaysSinceUpdate(days: number | null): string {
		if (days === null) return 'No update';
		return `${days}d`;
	}
</script>

{#snippet cell(row: IctAtRiskSoldierRow, column: ColumnDef<IctAtRiskSoldierRow>)}
	{#if column.key === 'soldier'}
		<span class="grid gap-0.5">
			<span class="font-medium text-foreground">{row.soldierName}</span>
			<span class="text-xs text-muted-foreground">{row.rank} / {row.groupName}</span>
		</span>
	{:else if column.key === 'readiness'}
		<span class="font-mono font-semibold">{row.readinessPercent}%</span>
	{:else}
		{String(column.value(row) ?? '')}
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
	title="At-Risk Soldiers - Call List"
	meta="Sorted worst first"
	aria-busy={loading ? 'true' : 'false'}
>
	{#if rows.length === 0}
		<ReportWorkspace.State
			state="no-data"
			title="No at-risk Soldiers"
			description="No Soldiers match the active filters."
		/>
	{:else}
		<DataTable.DataTable
			data={visibleRows}
			{columns}
			ariaLabel="At-risk Soldiers call list"
			emptyMessage="No Soldiers match the active filters."
			{loading}
			density="dense"
			stickyHeader
			rowKey={(row) => row.personnelId}
			{cell}
			footer={hasOverflow ? footer : undefined}
		/>
	{/if}
</ReportWorkspace.Section>
