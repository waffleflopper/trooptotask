<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data, form } = $props();
	let activeTab = $state<'pending' | 'reviewed'>('pending');
	let loadingId = $state<string | null>(null);

	function statusColor(status: string): string {
		switch (status) {
			case 'approved':
				return 'var(--color-success)';
			case 'rejected':
				return 'var(--color-error)';
			default:
				return 'var(--color-text-muted)';
		}
	}
</script>

<svelte:head>
	<title>Access Requests - Admin - Troop to Task</title>
</svelte:head>

<div class="access-requests-page">
	<header class="page-header">
		<div class="header-row">
			<h1>Access Requests</h1>
			{#if data.pending.length > 0}
				<Badge label="{data.pending.length} pending" color="var(--color-warning)" />
			{/if}
		</div>
		<p class="subtitle">Review and approve requests from potential users</p>
	</header>

	{#if form?.error}
		<div class="alert alert-error">{form.error}</div>
	{/if}

	<div class="tabs">
		<button class="tab" class:active={activeTab === 'pending'} onclick={() => (activeTab = 'pending')}>
			Pending
			{#if data.pending.length > 0}
				<span class="tab-count">{data.pending.length}</span>
			{/if}
		</button>
		<button class="tab" class:active={activeTab === 'reviewed'} onclick={() => (activeTab = 'reviewed')}>
			Reviewed
			{#if data.reviewed.length > 0}
				<span class="tab-count">{data.reviewed.length}</span>
			{/if}
		</button>
	</div>

	{#if activeTab === 'pending'}
		{#if data.pending.length === 0}
			<div class="empty-card">
				<p>No pending requests</p>
			</div>
		{:else}
			<div class="request-list">
				{#each data.pending as req (req.id)}
					<div class="request-card">
						<div class="request-info">
							<div class="request-name">{req.name}</div>
							<div class="request-email">{req.email}</div>
							{#if req.reason}
								<div class="request-reason">{req.reason}</div>
							{/if}
							<div class="request-date">Submitted {formatDisplayDateTime(req.created_at)}</div>
						</div>
						<div class="request-actions">
							<form
								method="POST"
								action="?/approve"
								use:enhance={() => {
									loadingId = req.id + '-approve';
									return async ({ update }) => {
										loadingId = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="requestId" value={req.id} />
								<button type="submit" class="btn btn-primary btn-sm" disabled={loadingId !== null}>
									{#if loadingId === req.id + '-approve'}
										<Spinner />
									{/if}
									Approve
								</button>
							</form>
							<form
								method="POST"
								action="?/reject"
								use:enhance={() => {
									loadingId = req.id + '-reject';
									return async ({ update }) => {
										loadingId = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="requestId" value={req.id} />
								<button type="submit" class="btn btn-danger btn-sm" disabled={loadingId !== null}>
									{#if loadingId === req.id + '-reject'}
										<Spinner />
									{/if}
									Reject
								</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else if data.reviewed.length === 0}
		<div class="empty-card">
			<p>No reviewed requests yet</p>
		</div>
	{:else}
		<div class="request-list">
			{#each data.reviewed as req (req.id)}
				<div class="request-card reviewed">
					<div class="request-info">
						<div class="request-header-row">
							<span class="request-name">{req.name}</span>
							<Badge label={req.status} color={statusColor(req.status)} />
						</div>
						<div class="request-email">{req.email}</div>
						{#if req.reason}
							<div class="request-reason">{req.reason}</div>
						{/if}
						<div class="request-date">
							Submitted {formatDisplayDateTime(req.created_at)}
							{#if req.reviewed_at}
								&middot; Reviewed {formatDisplayDateTime(req.reviewed_at)}
							{/if}
						</div>
					</div>
					{#if req.status === 'approved' && req.registration_invites && !req.registration_invites.used_by}
						<div class="request-actions">
							<form
								method="POST"
								action="?/resend"
								use:enhance={() => {
									loadingId = req.id + '-resend';
									return async ({ update }) => {
										loadingId = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="requestId" value={req.id} />
								<button type="submit" class="btn btn-secondary btn-sm" disabled={loadingId !== null}>
									{#if loadingId === req.id + '-resend'}
										<Spinner color="var(--color-text-muted)" />
									{/if}
									Resend
								</button>
							</form>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.access-requests-page {
		max-width: 800px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
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

	.alert-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.tab {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-muted);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab-count {
		background: var(--color-surface-variant);
		padding: 1px 8px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
	}

	.tab.active .tab-count {
		background: var(--color-primary);
		color: #0f0f0f;
	}

	/* Request cards */
	.request-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.request-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-lg);
	}

	.request-card.reviewed {
		opacity: 0.85;
	}

	.request-info {
		flex: 1;
		min-width: 0;
	}

	.request-header-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.request-name {
		font-weight: 600;
		color: var(--color-text);
		font-size: var(--font-size-base);
	}

	.request-email {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin-top: 2px;
	}

	.request-reason {
		margin-top: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.request-date {
		margin-top: var(--spacing-sm);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.request-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.empty-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		text-align: center;
		color: var(--color-text-muted);
	}

	:global([data-theme='dark']) .alert-error {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}

	@media (max-width: 600px) {
		.request-card {
			flex-direction: column;
		}

		.request-actions {
			width: 100%;
		}

		.request-actions form {
			flex: 1;
		}

		.request-actions .btn {
			width: 100%;
		}
	}
</style>
