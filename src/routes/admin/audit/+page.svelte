<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	function formatAction(action: string): string {
		return action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
	}

	function setFilter(action: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (action) {
			params.set('action', action);
		} else {
			params.delete('action');
		}
		params.set('page', '1');
		goto(`/admin/audit?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/admin/audit?${params.toString()}`);
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Audit Log - Admin - Troop to Task</title>
</svelte:head>

<div class="audit-page">
	<header class="page-header">
		<h1>Audit Log</h1>
		<p class="subtitle">Track all admin actions for accountability</p>
	</header>

	<!-- Filters -->
	<div class="filters">
		<select
			value={data.actionFilter}
			onchange={(e) => setFilter(e.currentTarget.value)}
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
					<th>Admin</th>
					<th>Action</th>
					<th>Target User</th>
					<th>Details</th>
				</tr>
			</thead>
			<tbody>
				{#each data.logs as log (log.id)}
					<tr>
						<td class="timestamp">{formatDisplayDateTime(log.createdAt)}</td>
						<td>
							<code class="user-id">{log.adminUserId.slice(0, 8)}...</code>
						</td>
						<td>
							<span class="action-badge">{formatAction(log.action)}</span>
						</td>
						<td>
							{#if log.targetUserId}
								<a href="/admin/users/{log.targetUserId}" class="user-link">
									{log.targetUserId.slice(0, 8)}...
								</a>
							{:else}
								<span class="no-target">-</span>
							{/if}
						</td>
						<td class="details-cell">
							{#if log.details}
								<details class="details-expand">
									<summary>View details</summary>
									<pre class="details-json">{JSON.stringify(log.details, null, 2)}</pre>
								</details>
							{:else}
								<span class="no-details">-</span>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="empty-state">No audit log entries</td>
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
		max-width: 1200px;
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

	.user-id {
		font-size: var(--font-size-xs);
		padding: 2px 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
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

	.user-link {
		color: var(--color-primary);
		text-decoration: none;
		font-family: monospace;
		font-size: var(--font-size-xs);
	}

	.user-link:hover {
		text-decoration: underline;
	}

	.no-target,
	.no-details {
		color: var(--color-text-muted);
	}

	.details-cell {
		max-width: 300px;
	}

	.details-expand summary {
		cursor: pointer;
		color: var(--color-primary);
		font-size: var(--font-size-xs);
	}

	.details-expand summary:hover {
		text-decoration: underline;
	}

	.details-json {
		margin-top: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
		font-size: var(--font-size-xs);
		overflow-x: auto;
		max-width: 300px;
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
