<script lang="ts">
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { formatRelativeDate } from '$lib/utils/dates';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { data } = $props();

	const orgId = $derived($page.params.orgId);

	const STATUS_COLORS: Record<string, { color: string; textColor?: string }> = {
		pending: { color: '#f59e0b' },
		approved: { color: '#22c55e' },
		denied: { color: '#ef4444' }
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
			: data.requests.filter((r: any) => r.status === statusFilter)
	);

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

	<!-- Status filter tabs -->
	<div class="filter-tabs">
		{#each filters as f}
			<button
				class="filter-tab"
				class:active={statusFilter === f.value}
				onclick={() => (statusFilter = f.value)}
			>
				{f.label}
			</button>
		{/each}
	</div>

	<!-- Requests table -->
	<div class="table-container">
		<table class="requests-table">
			<thead>
				<tr>
					<th>Requester</th>
					<th>Description</th>
					<th>Requested</th>
					<th>Status</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredRequests as req (req.id)}
					<tr>
						<td class="requester-cell">
							{req.requester_email ?? '-'}
						</td>
						<td class="description-cell">
							{#if req.resource_url}
								<a href={req.resource_url} class="resource-link">
									{req.resource_description ?? req.resource_type}
								</a>
							{:else}
								{req.resource_description ?? req.resource_type}
							{/if}
						</td>
						<td class="date-cell">
							{formatRelativeDate(req.created_at)}
						</td>
						<td>
							<Badge
								label={req.status.charAt(0).toUpperCase() + req.status.slice(1)}
								color={STATUS_COLORS[req.status]?.color ?? '#6b7280'}
							/>
						</td>
						<td class="actions-cell">
							{#if req.status === 'pending'}
								{#if denyingId === req.id}
									<div class="deny-form">
										<input
											type="text"
											class="input deny-input"
											placeholder="Reason (optional)"
											bind:value={denialReason}
											onkeydown={(e) => {
												if (e.key === 'Enter') handleAction(req.id, 'deny', denialReason);
												if (e.key === 'Escape') cancelDeny();
											}}
										/>
										<button
											class="btn btn-danger btn-sm"
											disabled={processing === req.id}
											onclick={() => handleAction(req.id, 'deny', denialReason)}
										>
											{#if processing === req.id}<Spinner />{/if}
											Confirm
										</button>
										<button class="btn btn-secondary btn-sm" onclick={cancelDeny}>
											Cancel
										</button>
									</div>
								{:else}
									<button
										class="btn btn-primary btn-sm"
										disabled={processing === req.id}
										onclick={() => handleAction(req.id, 'approve')}
									>
										{#if processing === req.id}<Spinner />{/if}
										Approve
									</button>
									<button
										class="btn btn-secondary btn-sm"
										onclick={() => startDeny(req.id)}
									>
										Deny
									</button>
								{/if}
							{:else if req.status === 'denied' && req.denial_reason}
								<span class="denial-reason">{req.denial_reason}</span>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="empty-state">No {statusFilter === 'all' ? '' : statusFilter} requests</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
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
		margin-bottom: var(--spacing-lg);
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

	/* Table */
	.table-container {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow-x: auto;
	}

	.requests-table {
		width: 100%;
		border-collapse: collapse;
	}

	.requests-table th,
	.requests-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.requests-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.requests-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		vertical-align: middle;
	}

	.requests-table tbody tr:hover {
		background: var(--color-surface-variant);
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
		white-space: nowrap;
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
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

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl) !important;
	}
</style>
