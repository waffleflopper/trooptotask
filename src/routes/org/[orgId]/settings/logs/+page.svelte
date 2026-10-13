<script lang="ts">
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar/index.js';
	import type { PageProps } from './$types';
	import type { LogsSettingsData } from '../settingsSectionTypes';
	import { formatAuditTimestamp, getAuditActionParts } from '../settingsWorkspaceFormatters';

	type AuditLogPage = LogsSettingsData['sections']['logs']['auditLogPage'];
	type LogsPageProps = PageProps & {
		data: PageProps['data'] & {
			logsSettings?: LogsSettingsData;
		};
	};

	let { data }: LogsPageProps = $props();

	const auditLog = $derived(data.logsSettings?.sections?.logs?.auditLogPage ?? null);
	const auditColumns: ColumnDef<AuditLogPage['logs'][number]>[] = [
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
	const auditTable = useDataTable({
		data: () => auditLog?.logs ?? [],
		columns: () => auditColumns,
		initialSortKey: 'time',
		initialSortDirection: 'desc',
		pageSize: 25
	});
	const searchTerm = $derived(auditTable.search.trim());
</script>

{#if auditLog}
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

			<WorkspaceToolbar
				ariaLabel="Audit log controls"
				items={[]}
				search={{
					label: 'Search audit log',
					placeholder: 'Search audit log',
					value: auditTable.search,
					onValueChange: auditTable.setSearch
				}}
			/>

			<DataTable.DataTable
				table={auditTable}
				ariaLabel="Organization audit log entries"
				emptyMessage={searchTerm ? `No audit log entries match "${searchTerm}".` : 'No audit log entries yet.'}
				density="dense"
			>
				{#snippet cell(log: AuditLogPage['logs'][number], column: ColumnDef<AuditLogPage['logs'][number]>)}
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
{:else}
	<div class="grid max-w-5xl gap-4">
		<section
			class="grid gap-2 rounded-lg border bg-card p-4 text-card-foreground"
			aria-labelledby="audit-log-unavailable-title"
		>
			<h2 id="audit-log-unavailable-title" class="text-lg font-semibold">Audit Log</h2>
			<p class="text-sm text-muted-foreground">Organization logs are not available.</p>
		</section>
	</div>
{/if}
