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
		pending: { color: 'var(--color-warning)' },
		approved: { color: 'var(--color-success)' },
		denied: { color: 'var(--color-error)' }
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
	<header class="page-header">
		<h1>Approvals</h1>
		<p class="subtitle">Review deletion requests from team members</p>
	</header>

	<DataTable
		{table}
		{columns}
		ariaLabel="Approval requests"
		emptyMessage="No {statusFilter === 'all' ? '' : statusFilter} requests"
	>
		{#snippet toolbar(_tbl)}
			<div class="filter-tabs">
				{#each filters as f}
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
					color={STATUS_COLORS[row.status]?.color ?? 'var(--color-text-muted)'}
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

<style>
	.approvals-page {
		max-width: 900px;
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
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

	/* Filter tabs */
	.filter-tabs {
		display: flex;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.filter-tab {
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.filter-tab:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.filter-tab.active {
		color: var(--color-primary);
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	.requester-cell {
		white-space: nowrap;
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}

	.description-cell {
		max-width: 300px;
	}

	.resource-link {
		color: var(--color-primary);
		text-decoration: none;
	}

	.resource-link:hover {
		text-decoration: underline;
	}

	.date-cell {
		white-space: nowrap;
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.actions-cell {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
		white-space: nowrap;
	}

	.deny-form {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.deny-input {
		width: 160px;
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.denial-reason {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
