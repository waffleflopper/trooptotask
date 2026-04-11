<script lang="ts">
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { formatRelativeDate } from '$lib/utils/dates';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';

	let { data } = $props();

	const orgId = $derived($page.params.orgId);

	const STATUS_COLORS: Record<string, { color: string; textColor?: string }> = {
		pending: { color: 'var(--amber-dark)' },
		approved: { color: 'var(--success)' },
		denied: { color: 'var(--danger)' }
	};

	const filters = [
		{ label: 'Pending', value: 'pending' },
		{ label: 'Approved', value: 'approved' },
		{ label: 'Denied', value: 'denied' },
		{ label: 'All', value: 'all' }
	];

	let statusFilter = $state('pending');

	const filteredRequests = $derived(
		statusFilter === 'all'
			? data.requests
			: data.requests.filter((r: Record<string, unknown>) => r.status === statusFilter)
	);

	type Request = (typeof data.requests)[number];

	const columns: ColumnDef<Request>[] = [
		{ key: 'requester', header: 'Requester', value: (r) => r.requester_email ?? '-' },
		{ key: 'description', header: 'Description', value: (r) => r.resource_description ?? r.resource_type },
		{
			key: 'requested',
			header: 'Requested',
			value: (r) => r.created_at,
			compare: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		},
		{ key: 'status', header: 'Status', value: (r) => r.status, searchable: false },
		{ key: 'actions', header: 'Actions', value: () => '', searchable: false }
	];

	const table = useDataTable({
		data: () => filteredRequests,
		columns,
		initialSortKey: 'requested',
		initialSortDirection: 'desc'
	});

	// Deny reason state
	let denyingId = $state<string | null>(null);
	let denialReason = $state('');
	let processing = $state<string | null>(null);

	async function handleAction(id: string, action: 'approve' | 'deny', reason?: string) {
		if (processing) return;
		processing = id;
		try {
			const res = await fetch(`/org/${orgId}/api/deletion-requests/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action, denialReason: reason ?? null })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Unknown error' }));
				alert(err.message || 'Failed to process request');
				return;
			}
			denyingId = null;
			denialReason = '';
			await invalidateAll();
		} finally {
			processing = null;
		}
	}

	function startDeny(id: string) {
		denyingId = id;
		denialReason = '';
	}

	function cancelDeny() {
		denyingId = null;
		denialReason = '';
	}
</script>

<svelte:head>
	<title>Approvals - Admin - Troop to Task</title>
</svelte:head>

<div class="approvals-page">
	<div class="overview-strip">
		<div class="overview-card">
			<span class="overview-label">Pending</span>
			<strong class="overview-value">{data.requests.filter((r) => r.status === 'pending').length}</strong>
			<span class="overview-meta">Requests still waiting on an admin decision</span>
		</div>
		<div class="overview-card">
			<span class="overview-label">Resolved</span>
			<strong class="overview-value">{data.requests.filter((r) => r.status !== 'pending').length}</strong>
			<span class="overview-meta">Requests already approved or denied</span>
		</div>
	</div>

	<div class="table-shell">
		<div class="page-header">
			<p class="eyebrow">Review Queue</p>
			<h2>Approvals</h2>
			<p class="subtitle">Review deletion requests from team members.</p>
		</div>

		<DataTable
			{table}
			{columns}
			ariaLabel="Approval requests"
			emptyMessage="No {statusFilter === 'all' ? '' : statusFilter} requests"
		>
			{#snippet toolbar(_tbl)}
				<div class="filter-tabs">
					{#each filters as f (f.value)}
						<button class="filter-tab" class:active={statusFilter === f.value} onclick={() => (statusFilter = f.value)}>
							{f.label}
						</button>
					{/each}
				</div>
			{/snippet}
			{#snippet cell(row, col)}
				{#if col.key === 'requester'}
					<span class="requester-cell">{row.requester_email ?? '-'}</span>
				{:else if col.key === 'description'}
					<span class="description-cell">
						{#if row.resource_url}
							<a href={row.resource_url} class="resource-link">
								{row.resource_description ?? row.resource_type}
							</a>
						{:else}
							{row.resource_description ?? row.resource_type}
						{/if}
					</span>
				{:else if col.key === 'requested'}
					<span class="date-cell">{formatRelativeDate(row.created_at)}</span>
				{:else if col.key === 'status'}
					<Badge
						label={row.status.charAt(0).toUpperCase() + row.status.slice(1)}
						color={STATUS_COLORS[row.status]?.color ?? 'var(--ink-60)'}
					/>
				{:else if col.key === 'actions'}
					{#if row.status === 'pending'}
						{#if denyingId === row.id}
							<div class="deny-form">
								<input
									type="text"
									class="input deny-input"
									placeholder="Reason (optional)"
									bind:value={denialReason}
									onkeydown={(e) => {
										if (e.key === 'Enter') handleAction(row.id, 'deny', denialReason);
										if (e.key === 'Escape') cancelDeny();
									}}
								/>
								<button
									class="btn btn-danger btn-sm"
									disabled={processing === row.id}
									onclick={() => handleAction(row.id, 'deny', denialReason)}
								>
									{#if processing === row.id}<Spinner />{/if}
									Confirm
								</button>
								<button class="btn btn-secondary btn-sm" onclick={cancelDeny}> Cancel </button>
							</div>
						{:else}
							<div class="actions-cell">
								<button
									class="btn btn-primary btn-sm"
									disabled={processing === row.id}
									onclick={() => handleAction(row.id, 'approve')}
								>
									{#if processing === row.id}<Spinner />{/if}
									Approve
								</button>
								<button class="btn btn-secondary btn-sm" onclick={() => startDeny(row.id)}> Deny </button>
							</div>
						{/if}
					{:else if row.status === 'denied' && row.denial_reason}
						<span class="denial-reason">{row.denial_reason}</span>
					{/if}
				{:else}
					{String(col.value(row) ?? '')}
				{/if}
			{/snippet}
		</DataTable>
	</div>
</div>

<style>
	.approvals-page {
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

	.filter-tabs {
		display: flex;
		gap: 0;
		flex-wrap: wrap;
		padding-bottom: var(--sp-3);
		border-bottom: var(--border-thin);
	}

	.filter-tab {
		padding: 0.7rem 0.95rem;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		border: var(--border-thin);
		border-right: none;
		cursor: pointer;
		border-radius: 0;
	}

	.filter-tab:first-child {
		border-radius: var(--radius-md) 0 0 var(--radius-md);
	}

	.filter-tab:last-child {
		border-right: var(--border-thin);
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
	}

	.filter-tab:hover {
		color: var(--text-strong);
	}

	.filter-tab.active {
		color: var(--text-strong);
		background: var(--surface-panel);
	}

	.requester-cell {
		white-space: nowrap;
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.description-cell {
		max-width: 300px;
	}

	.resource-link {
		color: var(--amber-dark);
		text-decoration: none;
	}

	.resource-link:hover {
		text-decoration: underline;
	}

	.date-cell {
		white-space: nowrap;
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.actions-cell {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		white-space: nowrap;
		flex-wrap: wrap;
	}

	.deny-form {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		flex-wrap: wrap;
	}

	.deny-input {
		width: 160px;
		font-size: var(--text-sm);
	}

	.denial-reason {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		font-style: italic;
	}

	@media (max-width: 640px) {
		.table-shell {
			padding: var(--sp-4);
		}
	}
</style>
