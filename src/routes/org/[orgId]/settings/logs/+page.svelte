<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { SettingsPageHeader } from '$features/organization';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import type { PageProps } from './$types';
	import type { LogsSettingsData } from '../settingsSectionTypes';
	import {
		AUDIT_SCOPE_OPTIONS,
		auditDayHead,
		viewAuditEntry,
		type AuditEntryView,
		type AuditScopeFilter
	} from './auditLogEntries';

	type LogsPageProps = PageProps & {
		data: PageProps['data'] & {
			logsSettings?: LogsSettingsData;
		};
	};

	let { data }: LogsPageProps = $props();

	const logs = $derived(data.logsSettings ?? null);
	const entries = $derived(logs ? logs.auditLog.logs.map((entry) => viewAuditEntry(entry, logs.timeZone)) : []);
	let scope = $state<AuditScopeFilter>('all');
	const scopedEntries = $derived(scope === 'all' ? entries : entries.filter((entry) => entry.scope === scope));

	const columns: ColumnDef<AuditEntryView>[] = [
		{
			key: 'time',
			header: 'Time',
			value: (entry) => entry.clock,
			compare: (a, b) => a.at - b.at,
			searchable: false,
			width: '5rem'
		},
		{ key: 'area', header: 'Area', value: (entry) => entry.area, width: '8.5rem' },
		{ key: 'event', header: 'Event', value: (entry) => entry.sentence, maxWidth: 'none' },
		{ key: 'actor', header: 'Actor', value: (entry) => entry.actor, width: '13rem' }
	];
	const table = useDataTable({
		data: () => scopedEntries,
		columns,
		initialSortKey: 'time',
		initialSortDirection: 'desc',
		pageSize: 25
	});

	const dayCounts = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const entry of table.allRows) counts.set(entry.day, (counts.get(entry.day) ?? 0) + 1);
		return counts;
	});
	const truncated = $derived(logs !== null && logs.auditLog.totalCount > entries.length);
	/** The oldest loaded day may continue past the loaded entries; a scoped or searched count is exact within them. */
	const cutOffDay = $derived.by(() => {
		if (!truncated || scope !== 'all' || table.search.trim() || entries.length === 0) return undefined;
		return entries.reduce((oldest, entry) => (entry.at < oldest.at ? entry : oldest)).day;
	});
	/** Rows that open a day on the current page; sorting by anything but time drops the day heads. */
	const dayStarts = $derived.by(() => {
		const starts = new SvelteSet<string>();
		if (table.sortKey !== 'time') return starts;
		let day: string | null = null;
		for (const entry of table.rows) {
			if (entry.day !== day) starts.add(entry.id);
			day = entry.day;
		}
		return starts;
	});

	const searchTerm = $derived(table.search.trim());
	const scopeLabel = $derived(AUDIT_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? '');
	const emptyMessage = $derived.by(() => {
		if (entries.length === 0) return 'No audit log entries yet.';
		const where = scope === 'all' ? '' : ` in ${scopeLabel}`;
		return searchTerm ? `No audit log entries match "${searchTerm}"${where}.` : `No audit log entries${where}.`;
	});

	const unit = $derived(data.settingsShell?.organization.name ?? 'the unit');
</script>

<SettingsPageHeader
	page="logs"
	subtitle={`Every change made in ${unit}, newest first. Kept for accountability, even after the records themselves are deleted.`}
/>

{#if logs}
	<section class="grid gap-4" aria-label="Audit log">
		<div class="flex flex-wrap items-center gap-3" role="group" aria-label="Audit log controls">
			<div class="w-full md:w-90">
				<InputGroup.Root>
					<InputGroup.Addon>
						<SearchIcon aria-hidden="true" />
					</InputGroup.Addon>
					<InputGroup.Input
						type="search"
						value={table.search}
						oninput={(event) => table.setSearch(event.currentTarget.value)}
						placeholder="Search people, areas, actors"
						aria-label="Search audit log"
					/>
				</InputGroup.Root>
			</div>
			<SegmentedFilter.Root
				options={AUDIT_SCOPE_OPTIONS}
				bind:value={
					() => scope,
					(next) => {
						scope = next;
						table.setPage(1);
					}
				}
				label="Audit log scope"
			/>
			<p class="font-mono text-xs text-muted-foreground md:ml-auto">
				{logs.auditLog.recentCount.toLocaleString('en-US')} this month · {logs.auditLog.totalCount.toLocaleString(
					'en-US'
				)} total
			</p>
		</div>

		<DataTable.DataTable
			{table}
			variant="editorial"
			stacked
			ariaLabel="Organization audit log entries"
			{emptyMessage}
			stickyHeader={false}
			pageLabels={{
				previous: 'Newer',
				next: 'Older',
				range: truncated
					? ({ first, last, total }) =>
							total === entries.length
								? `${first}–${last} of the latest ${total}`
								: `${first}–${last} of ${total} in the latest ${entries.length}`
					: undefined
			}}
		>
			{#snippet row(entry: AuditEntryView)}
				{#if dayStarts.has(entry.id)}
					{@const head = auditDayHead(entry.day, logs.today, dayCounts.get(entry.day) ?? 0, {
						cutOff: entry.day === cutOffDay
					})}
					<Table.Row class="border-b-foreground hover:bg-transparent">
						<th scope="colgroup" colspan={columns.length} class="pt-5 pb-2 text-left font-normal">
							<span class="font-heading text-lg leading-[22px] font-bold">{head.title}</span>
							<span class="ml-3 font-mono text-xs text-muted-foreground">{head.detail}</span>
						</th>
					</Table.Row>
				{/if}
				<Table.Row class="hover:bg-transparent [&>td]:py-2.5 [&>td]:align-top">
					<Table.Cell class="font-mono text-xs leading-5">
						<time datetime={new Date(entry.at).toISOString()}>{entry.clock}</time>
					</Table.Cell>
					<Table.Cell class="font-mono text-[11px] leading-5 font-medium tracking-[0.08em] uppercase">
						<span class={entry.scope === 'deletions' ? 'text-destructive-text' : 'text-muted-foreground'}>
							{entry.area}
						</span>
					</Table.Cell>
					<Table.Cell data-max-width="none" class="leading-5 whitespace-normal">{entry.sentence}</Table.Cell>
					<Table.Cell class="font-mono text-xs leading-5">
						{#if entry.system}
							<span class="text-muted-foreground italic">System</span>
						{:else}
							<span class="block max-w-52 truncate @max-2xl/data-table:max-w-full">{entry.actor}</span>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/snippet}
		</DataTable.DataTable>
	</section>
{:else}
	<section class="grid gap-2" aria-labelledby="audit-log-unavailable-title">
		<h2 id="audit-log-unavailable-title" class="font-heading text-[22px] leading-[26px] font-bold">Audit log</h2>
		<p class="text-sm text-muted-foreground">Organization logs are not available.</p>
	</section>
{/if}
