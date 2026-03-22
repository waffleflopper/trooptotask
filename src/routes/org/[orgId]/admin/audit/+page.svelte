<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';

	let { data } = $props();

	function formatAction(action: string): string {
		return action
			.replace(/\./g, ' > ')
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (l) => l.toUpperCase());
	}

	function getSummary(details: Record<string, unknown> | null): string {
		if (!details) return '';
		const parts: string[] = [];
		if (details.name) parts.push(String(details.name));
		for (const [k, v] of Object.entries(details)) {
			if (['actor', 'name'].includes(k)) continue;
			if (v === null || v === undefined) continue;
			const label = k.replace(/_/g, ' ');
			parts.push(`${label}: ${v}`);
		}
		return parts.join(' · ');
	}

	function setParam(key: string, value: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (value) {
			params.set(key, value);
		} else {
			params.delete(key);
		}
		params.set('page', '1');
		goto(`${$page.url.pathname}?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`${$page.url.pathname}?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));

	type AuditLog = (typeof data.logs)[number];

	const columns: ColumnDef<AuditLog>[] = [
		{ key: 'timestamp', header: 'Timestamp', value: (l) => l.createdAt },
		{ key: 'user', header: 'User', value: (l) => (l.details as Record<string, unknown>)?.actor ?? '-' },
		{ key: 'action', header: 'Action', value: (l) => l.action },
		{ key: 'description', header: 'Description', value: (l) => getSummary(l.details as Record<string, unknown>) }
	];
</script>

<svelte:head>
	<title>Audit Log - Troop to Task</title>
</svelte:head>

<div class="audit-page">
	<header class="page-header">
		<h1>Audit Log</h1>
		<p class="subtitle">Activity log for your organization</p>
	</header>

	<DataTable data={data.logs} {columns} ariaLabel="Audit log" emptyMessage="No audit log entries yet">
		{#snippet toolbar(_tbl)}
			<div class="filters">
				<select value={data.actionFilter} onchange={(e) => setParam('action', e.currentTarget.value)} class="select">
					<option value="">All Actions</option>
					{#each data.availableActions as action}
						<option value={action}>{formatAction(action)}</option>
					{/each}
				</select>
				<span class="count">{data.totalCount} entries</span>
			</div>
		{/snippet}
		{#snippet cell(row, col)}
			{#if col.key === 'timestamp'}
				<span class="timestamp">{formatDisplayDateTime(row.createdAt)}</span>
			{:else if col.key === 'user'}
				{#if (row.details as Record<string, unknown>)?.actor}
					<span class="actor">{(row.details as Record<string, unknown>).actor}</span>
				{:else}
					<span class="no-target">-</span>
				{/if}
			{:else if col.key === 'action'}
				<span class="action-badge">{formatAction(row.action)}</span>
			{:else if col.key === 'description'}
				{@const summary = getSummary(row.details as Record<string, unknown>)}
				<span class="description-cell">
					{#if summary}
						{summary}
					{:else if row.resourceType}
						<span class="resource-type">{row.resourceType.replace(/_/g, ' ')}</span>
						{#if row.resourceId}
							<code class="resource-id">{row.resourceId.slice(0, 8)}</code>
						{/if}
					{:else}
						<span class="no-details">-</span>
					{/if}
				</span>
			{:else}
				{String(col.value(row) ?? '')}
			{/if}
		{/snippet}
		{#snippet footer(_tbl)}
			{#if totalPages > 1}
				<div class="pagination">
					<button class="btn btn-secondary btn-sm" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}>
						Previous
					</button>
					<span class="page-info">Page {data.page} of {totalPages}</span>
					<button
						class="btn btn-secondary btn-sm"
						disabled={data.page >= totalPages}
						onclick={() => goToPage(data.page + 1)}
					>
						Next
					</button>
				</div>
			{/if}
		{/snippet}
	</DataTable>
</div>

<style>
	.audit-page {
		max-width: 900px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		color: var(--color-text-muted);
	}

	/* Filters */
	.filters {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	/* Cell styles */
	.timestamp {
		white-space: nowrap;
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.action-badge {
		display: inline-block;
		font-size: var(--font-size-xs);
		font-weight: 500;
		padding: 2px 8px;
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		color: var(--color-primary);
		border-radius: var(--radius-full);
		text-transform: capitalize;
	}

	.actor {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.description-cell {
		max-width: 400px;
	}

	.resource-type {
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: capitalize;
	}

	.resource-id {
		font-size: var(--font-size-xs);
		padding: 1px 4px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
		margin-left: 4px;
	}

	.no-target,
	.no-details {
		color: var(--color-text-muted);
	}

	/* Pagination */
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.page-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
</style>
