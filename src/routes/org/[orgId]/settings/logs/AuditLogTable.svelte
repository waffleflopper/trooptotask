<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { AuditLogQueryResult } from '$lib/audit/contracts';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import {
		AUDIT_SCOPE_OPTIONS,
		auditDayHead,
		auditLines,
		viewAuditEntry,
		type AuditEntryView,
		type AuditLine,
		type AuditScopeFilter
	} from './auditLogEntries';

	let { auditLog, timeZone, today }: { auditLog: AuditLogQueryResult; timeZone: string; today: string } = $props();

	const entries = $derived(auditLog.logs.map((entry) => viewAuditEntry(entry, timeZone)));
	let scope = $state<AuditScopeFilter>('all');
	const truncated = $derived(auditLog.totalCount > entries.length);
	/** The action that wrote the oldest loaded entry may have written more that were not loaded. */
	const partialBatchId = $derived.by(() => {
		if (!truncated || entries.length === 0) return null;
		return entries.reduce((oldest, entry) => (entry.at < oldest.at ? entry : oldest)).batchId;
	});
	const allLines = $derived(auditLines(entries, partialBatchId));
	const lines = $derived(
		scope === 'all'
			? allLines
			: auditLines(
					entries.filter((entry) => entry.scope === scope),
					partialBatchId
				)
	);
	const expanded = new SvelteSet<string>();

	const columns: ColumnDef<AuditLine>[] = [
		{
			key: 'time',
			header: 'Time',
			value: (line) => line.clock,
			compare: (a, b) => a.at - b.at,
			searchable: false,
			width: '5rem'
		},
		{ key: 'area', header: 'Area', value: (line) => line.area, width: '8.5rem' },
		{
			key: 'event',
			header: 'Event',
			value: (line) => line.sentence,
			searchValue: (line) => [line.sentence, ...line.batch.map((entry) => entry.sentence)].join(' '),
			maxWidth: 'none'
		},
		{ key: 'actor', header: 'Actor', value: (line) => line.actor, width: '13rem' }
	];
	const table = useDataTable({
		data: () => lines,
		columns,
		initialSortKey: 'time',
		initialSortDirection: 'desc',
		pageSize: 25
	});

	const dayCounts = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const line of table.allRows)
			counts.set(line.day, (counts.get(line.day) ?? 0) + Math.max(1, line.batch.length));
		return counts;
	});
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
		for (const line of table.rows) {
			if (line.day !== day) starts.add(line.id);
			day = line.day;
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

	function entryDomId(entry: AuditEntryView): string {
		return `audit-entry-${entry.id}`;
	}

	function toggle(line: AuditLine) {
		if (expanded.has(line.id)) expanded.delete(line.id);
		else expanded.add(line.id);
	}
</script>

{#snippet cells(entry: AuditEntryView, line?: AuditLine)}
	<Table.Cell class="font-mono text-xs leading-5">
		<time datetime={new Date(entry.at).toISOString()}>{entry.clock}</time>
	</Table.Cell>
	<Table.Cell class="font-mono text-[11px] leading-5 font-medium tracking-[0.08em] uppercase">
		<span class={entry.scope === 'deletions' ? 'text-destructive-text' : 'text-muted-foreground'}>
			{entry.area}
		</span>
	</Table.Cell>
	<Table.Cell data-max-width="none" class="leading-5 whitespace-normal">
		{#if !line}
			<span class="block pl-5.5">{entry.sentence}</span>
		{:else if line.batch.length > 0}
			{@const open = expanded.has(line.id)}
			<button
				type="button"
				class="flex items-start gap-1.5 rounded-sm text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
				aria-expanded={open}
				aria-controls={line.batch.map(entryDomId).join(' ')}
				onclick={() => toggle(line)}
			>
				<ChevronRightIcon
					class="mt-0.5 size-4 shrink-0 transition-transform motion-reduce:transition-none {open ? 'rotate-90' : ''}"
					aria-hidden="true"
				/>
				<span>{line.sentence}</span>
			</button>
		{:else}
			{line.sentence}
		{/if}
	</Table.Cell>
	<Table.Cell class="font-mono text-xs leading-5">
		{#if entry.system}
			<span class="text-muted-foreground italic">System</span>
		{:else}
			<span class="block max-w-52 truncate @max-2xl/data-table:max-w-full">{entry.actor}</span>
		{/if}
	</Table.Cell>
{/snippet}

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
			{auditLog.recentCount.toLocaleString('en-US')} this month · {auditLog.totalCount.toLocaleString('en-US')} total
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
						total === allLines.length
							? `${first}–${last} of the latest ${total}`
							: `${first}–${last} of ${total} in the latest ${allLines.length}`
				: undefined
		}}
	>
		{#snippet row(line: AuditLine)}
			{#if dayStarts.has(line.id)}
				{@const head = auditDayHead(line.day, today, dayCounts.get(line.day) ?? 0, {
					cutOff: line.day === cutOffDay
				})}
				<Table.Row class="border-b-foreground hover:bg-transparent">
					<th scope="colgroup" colspan={columns.length} class="pt-5 pb-2 text-left font-normal">
						<span class="font-heading text-lg leading-[22px] font-bold">{head.title}</span>
						<span class="ml-3 font-mono text-xs text-muted-foreground">{head.detail}</span>
					</th>
				</Table.Row>
			{/if}
			<Table.Row class="hover:bg-transparent [&>td]:py-2.5 [&>td]:align-top">
				{@render cells(line, line)}
			</Table.Row>
			{#each line.batch as entry (entry.id)}
				<Table.Row
					id={entryDomId(entry)}
					hidden={!expanded.has(line.id)}
					class="bg-muted/40 hover:bg-muted/40 [&>td]:py-2 [&>td]:align-top"
				>
					{@render cells(entry)}
				</Table.Row>
			{/each}
		{/snippet}
	</DataTable.DataTable>
</section>
