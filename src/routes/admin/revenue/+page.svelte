<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { formatPrice } from '$lib/types/subscription';

	let { data } = $props();

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/admin/revenue?${params.toString()}`);
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Revenue - Admin - Troop to Task</title>
</svelte:head>

<div class="revenue-page">
	<header class="page-header">
		<h1>Revenue</h1>
		<p class="subtitle">Payment history and revenue analytics</p>
	</header>

	<!-- Stats Grid -->
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-value">{formatPrice(data.stats.totalRevenue)}</div>
			<div class="stat-label">Total Revenue</div>
		</div>

		<div class="stat-card highlight">
			<div class="stat-value">{formatPrice(data.stats.thisMonthRevenue)}</div>
			<div class="stat-label">This Month</div>
			{#if data.stats.revenueGrowth !== 0}
				<div class="stat-change" class:positive={data.stats.revenueGrowth > 0} class:negative={data.stats.revenueGrowth < 0}>
					{data.stats.revenueGrowth > 0 ? '+' : ''}{data.stats.revenueGrowth}%
				</div>
			{/if}
		</div>

		<div class="stat-card">
			<div class="stat-value">{formatPrice(data.stats.lastMonthRevenue)}</div>
			<div class="stat-label">Last Month</div>
		</div>

		<div class="stat-card" class:warning={data.stats.failedPayments > 0}>
			<div class="stat-value">{data.stats.failedPayments}</div>
			<div class="stat-label">Failed Payments</div>
		</div>
	</div>

	<!-- Payments Table -->
	<section class="card">
		<h2>Payment History</h2>
		<div class="payments-table-container">
			<table class="payments-table">
				<thead>
					<tr>
						<th>Date</th>
						<th>User</th>
						<th>Amount</th>
						<th>Status</th>
						<th>Description</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.payments as payment (payment.id)}
						<tr>
							<td>{formatDate(payment.createdAt)}</td>
							<td>
								<a href="/admin/users/{payment.userId}" class="user-link">
									{payment.userId.slice(0, 8)}...
								</a>
							</td>
							<td class="amount" class:positive={payment.status === 'succeeded'}>
								{formatPrice(payment.amount)}
							</td>
							<td>
								<span class="status-badge" class:succeeded={payment.status === 'succeeded'} class:failed={payment.status === 'failed'} class:refunded={payment.status === 'refunded'}>
									{payment.status}
								</span>
							</td>
							<td class="description">{payment.description || '-'}</td>
							<td>
								{#if payment.receiptUrl}
									<a href={payment.receiptUrl} target="_blank" rel="noopener" class="receipt-link">
										Receipt
									</a>
								{/if}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="empty-state">No payments yet</td>
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
	</section>
</div>

<style>
	.revenue-page {
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

	/* Stats Grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-xl);
	}

	.stat-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		text-align: center;
	}

	.stat-card.highlight {
		background: var(--color-success);
		border-color: var(--color-success);
	}

	.stat-card.warning .stat-value {
		color: var(--color-error);
	}

	.stat-value {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.stat-card.highlight .stat-value {
		color: white;
	}

	.stat-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-top: 4px;
	}

	.stat-card.highlight .stat-label {
		color: rgba(255, 255, 255, 0.85);
	}

	.stat-change {
		font-size: var(--font-size-sm);
		font-weight: 600;
		margin-top: var(--spacing-xs);
	}

	.stat-change.positive {
		color: white;
	}

	.stat-change.negative {
		color: #fee2e2;
	}

	/* Card */
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	/* Payments Table */
	.payments-table-container {
		overflow-x: auto;
	}

	.payments-table {
		width: 100%;
		border-collapse: collapse;
	}

	.payments-table th,
	.payments-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.payments-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.payments-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.payments-table tbody tr:hover {
		background: var(--color-surface-variant);
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

	.amount {
		font-weight: 600;
	}

	.amount.positive {
		color: var(--color-success);
	}

	.status-badge {
		display: inline-block;
		font-size: var(--font-size-xs);
		font-weight: 500;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		text-transform: capitalize;
	}

	.status-badge.succeeded {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
	}

	.status-badge.failed {
		background: color-mix(in srgb, var(--color-error) 15%, transparent);
		color: var(--color-error);
	}

	.status-badge.refunded {
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		color: var(--color-warning);
	}

	.description {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.receipt-link {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		text-decoration: none;
	}

	.receipt-link:hover {
		text-decoration: underline;
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
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.page-btn:hover:not(:disabled) {
		background: var(--color-border);
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
