<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data } = $props();

	function setParam(key: string, value: string) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		if (value) params.set(key, value);
		else params.delete(key);
		params.set('page', '1');
		goto(`/admin/audit?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/admin/audit?${params.toString()}`);
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Audit Log - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Security Trail</p>
			<h1 class="admin-page-title">Audit Log</h1>
			<p class="admin-page-subtitle">
				Central record of authentication, administrative actions, and sensitive resource changes across the platform.
			</p>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Total Entries</p>
			<p class="admin-overview-card__value">{data.totalCount}</p>
			<p class="admin-overview-card__meta">Events currently matching the active filter set.</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Page</p>
			<p class="admin-overview-card__value">{data.page}</p>
			<p class="admin-overview-card__meta">
				Reviewing page {data.page} of {Math.max(totalPages, 1)} in the audit trail.
			</p>
		</div>
	</div>

	<div class="admin-toolbar">
		<div class="admin-toolbar__group">
			<div class="admin-toolbar__field">
				<Label for="action-filter">Action</Label>
				<NativeSelect
					id="action-filter"
					value={data.actionFilter}
					onchange={(event) => setParam('action', event.currentTarget.value)}
				>
					<option value="">All actions</option>
					{#each data.availableActions as action (action)}
						<option value={action}>{formatAdminLabel(action)}</option>
					{/each}
				</NativeSelect>
			</div>
			<div class="admin-toolbar__field">
				<Label for="severity-filter">Severity</Label>
				<NativeSelect
					id="severity-filter"
					value={data.severityFilter}
					onchange={(event) => setParam('severity', event.currentTarget.value)}
				>
					<option value="">All severities</option>
					<option value="info">Info</option>
					<option value="warning">Warning</option>
					<option value="critical">Critical</option>
				</NativeSelect>
			</div>
		</div>
		<div class="admin-toolbar__meta">
			<span>{data.logs.length} entries shown</span>
		</div>
	</div>

	<div class="admin-table-shell admin-table-shell--scroll">
		<table class="admin-table audit-table">
			<thead>
				<tr>
					<th>Timestamp</th>
					<th>Severity</th>
					<th>Action</th>
					<th>User</th>
					<th>Resource</th>
					<th>IP</th>
					<th>Details</th>
				</tr>
			</thead>
			<tbody>
				{#each data.logs as log (log.id)}
					<tr>
						<td class="timestamp-cell">{formatDisplayDateTime(log.createdAt)}</td>
						<td><Badge variant={adminBadgeVariant(log.severity)}>{formatAdminLabel(log.severity)}</Badge></td>
						<td><span class="admin-code">{formatAdminLabel(log.action)}</span></td>
						<td>
							{#if log.userId}
								<a href="/admin/users/{log.userId}" class="audit-link">{log.userId.slice(0, 8)}...</a>
							{:else}
								<span class="text-muted">—</span>
							{/if}
						</td>
						<td>
							{#if log.resourceType}
								<div class="resource-cell">
									<span>{log.resourceType}</span>
									{#if log.resourceId}<span class="admin-code">{log.resourceId.slice(0, 8)}...</span>{/if}
								</div>
							{:else}
								<span class="text-muted">—</span>
							{/if}
						</td>
						<td
							>{#if log.ipAddress}<span class="admin-code">{log.ipAddress}</span>{:else}<span class="text-muted">—</span
								>{/if}</td
						>
						<td>
							{#if log.details && Object.keys(log.details).length > 0}
								<details class="detail-toggle">
									<summary>View</summary>
									<pre>{JSON.stringify(log.details, null, 2)}</pre>
								</details>
							{:else}
								<span class="text-muted">—</span>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="admin-empty">No audit log entries.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<div class="pagination-row">
			<Button variant="outline" size="sm" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}>
				Previous
			</Button>
			<span>Page {data.page} of {totalPages}</span>
			<Button variant="outline" size="sm" disabled={data.page >= totalPages} onclick={() => goToPage(data.page + 1)}>
				Next
			</Button>
		</div>
	{/if}
</div>

<style>
	.timestamp-cell {
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.audit-link {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.resource-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.detail-toggle summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.detail-toggle pre {
		margin: var(--sp-2) 0 0;
		padding: var(--sp-3);
		max-width: 360px;
		overflow: auto;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.pagination-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-3);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
</style>
