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
		{ key: 'user', header: 'User', value: (l) => l.actor ?? '-' },
		{ key: 'action', header: 'Action', value: (l) => l.action },
		{ key: 'description', header: 'Description', value: (l) => getSummary(l.details as Record<string, unknown>) }
	];
</script>

<svelte:head>
	<title>Audit Log - Troop to Task</title>
</svelte:head>

<div class="audit-page">
	<div class="overview-strip">
		<div class="overview-card">
			<span class="overview-label">Entries</span>
			<strong class="overview-value">{data.totalCount}</strong>
			<span class="overview-meta">Audit records currently matching the active filter</span>
		</div>
		<div class="overview-card">
			<span class="overview-label">Page</span>
			<strong class="overview-value">{data.page}</strong>
			<span class="overview-meta">Reviewing page {data.page} of {totalPages || 1}</span>
		</div>
	</div>

	<div class="table-shell">
		<header class="page-header">
			<p class="eyebrow">Activity Review</p>
			<h2>Audit Log</h2>
			<p class="subtitle">Activity log for your organization.</p>
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
					{#if row.actor}
						<span class="actor">{row.actor}</span>
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
</div>

<style>
	.audit-page {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.overview-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--sp-3);
	}

	.overview-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.overview-label,
	.eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.overview-label {
		color: var(--text-muted);
	}

	.eyebrow {
		margin: 0;
		color: var(--amber);
	}

	.overview-value {
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 4vw, 2.5rem);
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.overview-meta {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.table-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.page-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.subtitle {
		margin: 0;
		color: var(--text-secondary);
		line-height: 1.55;
	}

	.filters {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding-bottom: var(--sp-3);
		border-bottom: var(--border-thin);
		flex-wrap: wrap;
	}

	.count {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.timestamp {
		white-space: nowrap;
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.action-badge {
		display: inline-block;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		font-weight: 600;
		padding: 3px 8px;
		background: color-mix(in srgb, var(--amber-light) 84%, var(--surface-panel) 16%);
		color: var(--amber-dark);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		text-transform: capitalize;
	}

	.actor {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.description-cell {
		max-width: 400px;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.resource-type {
		font-size: var(--text-xs);
		font-weight: 500;
		text-transform: capitalize;
	}

	.resource-id {
		font-size: var(--text-xs);
		padding: 1px 4px;
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		border-radius: var(--radius-sm);
		margin-left: 4px;
	}

	.no-target,
	.no-details {
		color: var(--text-muted);
	}

	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: var(--border-thin);
		flex-wrap: wrap;
	}

	.page-info {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	@media (max-width: 640px) {
		.table-shell {
			padding: var(--sp-4);
		}
	}
</style>
