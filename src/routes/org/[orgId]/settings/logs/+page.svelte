<script lang="ts">
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
	import { formatAuditTimestamp, getAuditActionParts } from '../settingsWorkspaceFormatters';

	type SettingsLogsPageData = {
		orgUrlSegment: string;
		auditLogPage: AuditLogQueryResult;
	};

	let { data }: { data: SettingsLogsPageData } = $props();

	const auditLog = $derived(data.auditLogPage);
	const auditColumns: ColumnDef<(typeof auditLog.logs)[number]>[] = [
		{
			key: 'time',
			header: 'Time',
			value: (log) => formatAuditTimestamp(log.createdAt),
			sortable: true,
			compare: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			width: '9rem'
		},
		{
			key: 'area',
			header: 'Area',
			value: (log) => getAuditActionParts(log.action).area,
			searchable: true,
			sortable: true
		},
		{
			key: 'event',
			header: 'Event',
			value: (log) => getAuditActionParts(log.action).event,
			searchable: true,
			sortable: true
		},
		{
			key: 'actor',
			header: 'Actor',
			value: (log) => log.actor ?? 'System',
			searchable: true,
			sortable: true,
			align: 'right'
		}
	];
</script>

<div class="grid max-w-5xl gap-4">
	<section class="grid gap-3 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="audit-log-title">
		<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
			<div class="grid gap-1">
				<h2 id="audit-log-title" class="text-lg font-semibold">Audit Log</h2>
				<p class="text-sm text-muted-foreground">
					Showing the latest {auditLog.logs.length} of {auditLog.totalCount} entries
				</p>
			</div>
			<p class="text-sm text-muted-foreground">{auditLog.last30DaysCount} entries in the last 30 days</p>
		</div>

		<DataTable.DataTable
			data={auditLog.logs}
			columns={auditColumns}
			ariaLabel="Organization audit log entries"
			emptyMessage="No audit log entries yet."
			density="dense"
			pageSize={25}
			showSearch
			searchPlaceholder="Search audit log"
			initialSortKey="time"
			initialSortDirection="desc"
		>
			{#snippet cell(log: (typeof auditLog.logs)[number], column: ColumnDef<(typeof auditLog.logs)[number]>)}
				{#if column.key === 'time'}
					<time class="text-sm text-muted-foreground" datetime={log.createdAt}>
						{formatAuditTimestamp(log.createdAt)}
					</time>
				{:else if column.key === 'area'}
					<span class="font-medium">{getAuditActionParts(log.action).area}</span>
				{:else if column.key === 'event'}
					<span>{getAuditActionParts(log.action).event}</span>
				{:else if column.key === 'actor'}
					<span class="block max-w-72 truncate text-muted-foreground">{log.actor ?? 'System'}</span>
				{:else}
					{String(column.value(log))}
				{/if}
			{/snippet}
		</DataTable.DataTable>
	</section>
</div>
