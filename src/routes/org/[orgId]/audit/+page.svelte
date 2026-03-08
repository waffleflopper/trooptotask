<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	function formatAction(action: string): string {
		return action.replace(/\./g, ' > ').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
	}

	/** Extract a human-readable description from log details, excluding actor */
	function getSummary(details: Record<string, unknown> | null): string {
		if (!details) return '';
		const parts: string[] = [];
		if (details.name) parts.push(String(details.name));
		// Show remaining non-id, non-actor fields as key=value
		for (const [k, v] of Object.entries(details)) {
			if (['actor', 'name'].includes(k)) continue;
			if (v === null || v === undefined) continue;
			parts.push(`${k.replace(/_/g, ' ')}: ${v}`);
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
		goto(`${$page.url.pathname}?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`${$page.url.pathname}?${params.toString()}`);
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Audit Log - Troop to Task</title>
</svelte:head>

<div class="audit-page">
	<header class="page-header">
		<h1>Audit Log</h1>
		<p class="subtitle">Activity log for your organization</p>
	</header>

	<!-- Filters -->
	<div class="filters">
		<select
			value={data.actionFilter}
			onchange={(e) => setParam('action', e.currentTarget.value)}
			class="filter-select"
		>
			<option value="">All Actions</option>
			{#each data.availableActions as action}
				<option value={action}>{formatAction(action)}</option>
			{/each}
		</select>

		<span class="count">{data.totalCount} entries</span>
	</div>

	<!-- Audit Log Table -->
	<div class="audit-table-container">
		<table class="audit-table">
			<thead>
				<tr>
					<th>Timestamp</th>
					<th>User</th>
					<th>Action</th>
					<th>Description</th>
				</tr>
			</thead>
			<tbody>
				{#each data.logs as log (log.id)}
					{@const summary = getSummary(log.details)}
					<tr>
						<td class="timestamp">{formatDisplayDateTime(log.createdAt)}</td>
						<td class="actor-cell">
							{#if log.details?.actor}
								<span class="actor">{log.details.actor}</span>
							{:else}
								<span class="no-target">-</span>
							{/if}
						</td>
						<td>
							<span class="action-badge">{formatAction(log.action)}</span>
						</td>
						<td class="description-cell">
							{#if summary}
								<span class="description">{summary}</span>
							{:else if log.resourceType}
								<span class="resource-type">{log.resourceType.replace(/_/g, ' ')}</span>
								{#if log.resourceId}
									<code class="resource-id">{log.resourceId.slice(0, 8)}</code>
								{/if}
							{:else}
								<span class="no-details">-</span>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="4" class="empty-state">No audit log entries yet</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="pagination">
			<button
				class="page-btn"
				disabled={data.page <= 1}
				onclick={() => goToPage(data.page - 1)}
			>
				Previous
			</button>

			<span class="page-info">
				Page {data.page} of {totalPages}
			</span>

			<button
				class="page-btn"
				disabled={data.page >= totalPages}
				onclick={() => goToPage(data.page + 1)}
			>
				Next
			</button>
		</div>
	{/if}
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
		margin-bottom: var(--spacing-lg);
	}

	.filter-select {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	/* Table */
	.audit-table-container {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow-x: auto;
	}

	.audit-table {
		width: 100%;
		border-collapse: collapse;
	}

	.audit-table th,
	.audit-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.audit-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.audit-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		vertical-align: top;
	}

	.audit-table tbody tr:hover {
		background: var(--color-surface-variant);
	}

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

	.actor-cell {
		white-space: nowrap;
	}

	.actor {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}

	.description-cell {
		max-width: 400px;
	}

	.description {
		font-size: var(--font-size-sm);
	}

	.no-target,
	.no-details {
		color: var(--color-text-muted);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl) !important;
	}

	/* Pagination */
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--spacing-md);
		margin-top: var(--spacing-lg);
	}

	.page-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.page-btn:hover:not(:disabled) {
		background: var(--color-surface-variant);
	}

	.page-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.page-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
</style>
