<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { auditLogFilterParams, hasAuditLogFilters, type AuditLogFilters } from '$lib/audit/auditLogFilters';
	import type { AuditLogEntry, AuditLogQueryResult } from '$lib/audit/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useServerDataTable, type ColumnDef } from '$lib/components/ui/data-table/index.js';
	import * as Empty from '$lib/components/ui/empty';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Table from '$lib/components/ui/table/index.js';
	import { auditDayHead, auditLines, viewAuditEntry, type AuditEntryView, type AuditLine } from './auditLogEntries';

	let {
		auditLog,
		filters,
		timeZone,
		today
	}: { auditLog: AuditLogQueryResult; filters: AuditLogFilters; timeZone: string; today: string } = $props();

	/** Pages read after this one, tied to the page they follow so a new first page starts the list over. */
	let more = $state.raw<{ after: AuditLogQueryResult; logs: AuditLogEntry[]; nextCursor: string | null } | null>(null);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	const current = $derived(more?.after === auditLog ? more : null);
	const nextCursor = $derived(current ? current.nextCursor : auditLog.nextCursor);

	const entries = $derived(
		[...auditLog.logs, ...(current?.logs ?? [])].map((entry) => viewAuditEntry(entry, timeZone))
	);
	/** The oldest loaded entry's action may have written more entries than are loaded until the next page arrives. */
	const partialBatchId = $derived(
		nextCursor && entries.length > 0 ? (entries[entries.length - 1]?.batchId ?? null) : null
	);
	const lines = $derived(auditLines(entries, partialBatchId));
	const expanded = new SvelteSet<string>();

	const columns: ColumnDef<AuditLine>[] = [
		{ key: 'time', header: 'Time', value: (line) => line.clock, sortable: false, width: '5rem' },
		{ key: 'area', header: 'Area', value: (line) => line.area, sortable: false, width: '8.5rem' },
		{ key: 'event', header: 'Event', value: (line) => line.sentence, sortable: false, maxWidth: 'none' },
		{ key: 'actor', header: 'Actor', value: (line) => line.actor, sortable: false, width: '13rem' }
	];
	const table = useServerDataTable({
		rows: () => lines,
		columns: () => columns,
		sort: () => ({ key: 'time', direction: 'desc' }),
		onSort: () => {}
	});

	const dayCounts = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const line of lines) counts.set(line.day, (counts.get(line.day) ?? 0) + Math.max(1, line.batch.length));
		return counts;
	});
	/** The oldest loaded day may go on past the loaded entries, so its count reads as a floor. */
	const cutOffDay = $derived(nextCursor && entries.length > 0 ? entries[entries.length - 1]?.day : undefined);
	const dayStarts = $derived.by(() => {
		const starts = new SvelteSet<string>();
		let day: string | null = null;
		for (const line of lines) {
			if (line.day !== day) starts.add(line.id);
			day = line.day;
		}
		return starts;
	});

	let alive = true;
	$effect(() => () => {
		alive = false;
	});

	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		const after = auditLog;
		const cursor = nextCursor;
		loadingMore = true;
		loadMoreFailed = false;
		try {
			const params = auditLogFilterParams(filters);
			params.set('after', cursor);
			const response = await fetch(`/org/${page.params.orgId}/api/audit-log?${params}`);
			if (!response.ok) throw new Error('The next entries could not be read.');
			const next = (await response.json()) as AuditLogQueryResult;
			if (!alive || auditLog !== after) return;
			more = { after, logs: [...(current?.logs ?? []), ...next.logs], nextCursor: next.nextCursor };
		} catch {
			if (alive && auditLog === after) loadMoreFailed = true;
		} finally {
			if (alive) loadingMore = false;
		}
	}

	function clearFilters() {
		return goto(resolve('/org/[orgId]/settings/logs', { orgId: page.params.orgId ?? '' }), { reset: false });
	}

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
	{#if lines.length === 0}
		<Empty.Root class="rounded-lg border">
			<Empty.Header>
				{#if hasAuditLogFilters(filters)}
					<Empty.Title>No entries match these filters.</Empty.Title>
					<Empty.Description>Widen the dates or clear a filter to see more of the log.</Empty.Description>
				{:else}
					<Empty.Title>No audit log entries yet.</Empty.Title>
					<Empty.Description>Changes made in this unit will appear here.</Empty.Description>
				{/if}
			</Empty.Header>
			{#if hasAuditLogFilters(filters)}
				<Empty.Content>
					<Button variant="outline" onclick={clearFilters}>Clear filters</Button>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<DataTable.DataTable
			{table}
			variant="editorial"
			stacked
			ariaLabel="Organization audit log entries"
			stickyHeader={false}
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
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase" role="status">
				{entries.length.toLocaleString('en-US')}
				{entries.length === 1 ? 'entry' : 'entries'} loaded{nextCursor ? ' · more available' : ' · end of the log'}
			</p>
			{#if nextCursor}
				<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
					{#if loadingMore}<Spinner />{/if}
					Load more
				</Button>
			{/if}
		</div>
		{#if loadMoreFailed}
			<Alert.Root variant="destructive" role="alert">
				<Alert.Title>The next entries could not be loaded.</Alert.Title>
				<Alert.Description>
					<span>The entries above are unchanged.</span>
					<span class="mt-2 block"><Button variant="outline" size="sm" onclick={loadMore}>Retry</Button></span>
				</Alert.Description>
			</Alert.Root>
		{/if}
	{/if}
</section>
