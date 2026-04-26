<script lang="ts">
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { formatRelativeDate } from '$lib/utils/dates';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
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
	<FloatingPageToolbar ariaLabel="Approval request filters" leadingMin="0" collapse="narrow">
		{#snippet leading()}
			<SegmentedControl ariaLabel="Approval status filter" options={filters} bind:value={statusFilter} />
			<span class="toolbar-count">{filteredRequests.length} shown</span>
		{/snippet}
	</FloatingPageToolbar>

	<div class="table-shell">
		<DataTable
			{table}
			{columns}
			ariaLabel="Approval requests"
			emptyMessage="No {statusFilter === 'all' ? '' : statusFilter} requests"
		>
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

	.table-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.toolbar-count {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
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
