<script lang="ts">
	import { formatPrice } from '$lib/types/subscription';

	let { data } = $props();

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Admin Dashboard - Troop to Task</title>
</svelte:head>

<div class="admin-dashboard">
	<header class="page-header">
		<h1>Dashboard</h1>
		<p class="subtitle">Platform overview and key metrics</p>
	</header>

	{#if data.pendingAccessRequests > 0}
		<a href="/admin/access-requests" class="alert-banner">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
				<polyline points="22,6 12,13 2,6"></polyline>
			</svg>
			<span>{data.pendingAccessRequests} pending access request{data.pendingAccessRequests === 1 ? '' : 's'}</span>
			<span class="alert-action">Review</span>
		</a>
	{/if}

	<!-- Key Metrics -->
	<div class="metrics-grid">
		<div class="metric-card">
			<div class="metric-value">{data.metrics.totalUsers}</div>
			<div class="metric-label">Total Users</div>
		</div>

		<div class="metric-card highlight">
			<div class="metric-value">{formatPrice(data.metrics.mrr)}</div>
			<div class="metric-label">Monthly Recurring Revenue</div>
		</div>

		<div class="metric-card">
			<div class="metric-value">{data.metrics.activeSubscriptions}</div>
			<div class="metric-label">Paid Subscriptions</div>
		</div>

		<div class="metric-card" class:warning={data.metrics.pastDueUsers > 0}>
			<div class="metric-value">{data.metrics.pastDueUsers}</div>
			<div class="metric-label">Past Due</div>
		</div>
	</div>

	<!-- Plan Distribution -->
	<section class="card">
		<h2>Plan Distribution</h2>
		<div class="plan-bars">
			<div class="plan-bar">
				<div class="plan-info">
					<span class="plan-name">Free</span>
					<span class="plan-count">{data.metrics.freeUsers}</span>
				</div>
				<div class="bar-track">
					<div
						class="bar-fill free"
						style="width: {data.metrics.totalUsers > 0 ? (data.metrics.freeUsers / data.metrics.totalUsers) * 100 : 0}%"
					></div>
				</div>
			</div>

			<div class="plan-bar">
				<div class="plan-info">
					<span class="plan-name">Pro</span>
					<span class="plan-count">{data.metrics.proUsers}</span>
				</div>
				<div class="bar-track">
					<div
						class="bar-fill pro"
						style="width: {data.metrics.totalUsers > 0 ? (data.metrics.proUsers / data.metrics.totalUsers) * 100 : 0}%"
					></div>
				</div>
			</div>

			<div class="plan-bar">
				<div class="plan-info">
					<span class="plan-name">Team</span>
					<span class="plan-count">{data.metrics.teamUsers}</span>
				</div>
				<div class="bar-track">
					<div
						class="bar-fill team"
						style="width: {data.metrics.totalUsers > 0 ? (data.metrics.teamUsers / data.metrics.totalUsers) * 100 : 0}%"
					></div>
				</div>
			</div>
		</div>
	</section>

	<div class="two-column">
		<!-- Growth -->
		<section class="card">
			<h2>This Month</h2>
			<div class="stats-list">
				<div class="stat-item">
					<span class="stat-label">New Users</span>
					<span class="stat-value positive">+{data.metrics.newUsersThisMonth}</span>
				</div>
				<div class="stat-item">
					<span class="stat-label">Churned</span>
					<span class="stat-value negative">-{data.metrics.churnedThisMonth}</span>
				</div>
				<div class="stat-item">
					<span class="stat-label">Net Growth</span>
					<span class="stat-value" class:positive={data.metrics.newUsersThisMonth > data.metrics.churnedThisMonth} class:negative={data.metrics.newUsersThisMonth < data.metrics.churnedThisMonth}>
						{data.metrics.newUsersThisMonth - data.metrics.churnedThisMonth >= 0 ? '+' : ''}{data.metrics.newUsersThisMonth - data.metrics.churnedThisMonth}
					</span>
				</div>
			</div>
		</section>

		<!-- Recent Payments -->
		<section class="card">
			<div class="card-header">
				<h2>Recent Payments</h2>
				<a href="/admin/revenue" class="view-all">View All</a>
			</div>
			{#if data.recentPayments.length > 0}
				<div class="activity-list">
					{#each data.recentPayments as payment (payment.id)}
						<div class="activity-item">
							<span class="activity-amount" class:succeeded={payment.status === 'succeeded'} class:failed={payment.status === 'failed'}>
								{formatPrice(payment.amount)}
							</span>
							<span class="activity-time">{formatDate(payment.created_at)}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty-state">No recent payments</p>
			{/if}
		</section>
	</div>

	<!-- Quick Actions -->
	<section class="card">
		<h2>Quick Actions</h2>
		<div class="quick-actions">
			<a href="/admin/users" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8"></circle>
					<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
				</svg>
				Search Users
			</a>
			<a href="/admin/revenue" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="20" x2="18" y2="10"></line>
					<line x1="12" y1="20" x2="12" y2="4"></line>
					<line x1="6" y1="20" x2="6" y2="14"></line>
				</svg>
				Revenue Reports
			</a>
			<a href="/admin/access-requests" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
					<polyline points="22,6 12,13 2,6"></polyline>
				</svg>
				Access Requests
			</a>
			<a href="/admin/audit" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
				</svg>
				Audit Log
			</a>
		</div>
	</section>
</div>

<style>
	.admin-dashboard {
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

	/* Alert Banner */
	.alert-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) var(--spacing-lg);
		background: #fef3c7;
		border: 1px solid #fcd34d;
		border-radius: var(--radius-lg);
		color: #92400e;
		font-weight: 500;
		text-decoration: none;
		margin-bottom: var(--spacing-lg);
		transition: all 0.15s;
	}

	.alert-banner:hover {
		background: #fde68a;
	}

	.alert-action {
		margin-left: auto;
		font-weight: 600;
		color: var(--color-primary);
	}

	:global([data-theme='dark']) .alert-banner {
		background: #451a03;
		border-color: #92400e;
		color: #fcd34d;
	}

	:global([data-theme='dark']) .alert-banner:hover {
		background: #5c2800;
	}

	/* Metrics Grid */
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-xl);
	}

	.metric-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		text-align: center;
	}

	.metric-card.highlight {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #0F0F0F;
	}

	.metric-card.warning .metric-value {
		color: var(--color-warning);
	}

	.metric-value {
		font-size: var(--font-size-3xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
	}

	.metric-card.highlight .metric-value {
		color: #0F0F0F;
	}

	.metric-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-top: var(--spacing-xs);
	}

	.metric-card.highlight .metric-label {
		color: rgba(255, 255, 255, 0.85);
	}

	/* Cards */
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-md);
	}

	.card-header h2 {
		margin: 0;
	}

	.view-all {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		text-decoration: none;
	}

	.view-all:hover {
		text-decoration: underline;
	}

	/* Plan Distribution */
	.plan-bars {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.plan-bar {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.plan-info {
		display: flex;
		justify-content: space-between;
		font-size: var(--font-size-sm);
	}

	.plan-name {
		font-weight: 500;
		color: var(--color-text);
	}

	.plan-count {
		color: var(--color-text-muted);
	}

	.bar-track {
		height: 8px;
		background: var(--color-border);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
	}

	.bar-fill.free {
		background: var(--color-text-muted);
	}

	.bar-fill.pro {
		background: var(--color-primary);
	}

	.bar-fill.team {
		background: var(--color-success);
	}

	/* Two Column */
	.two-column {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--spacing-lg);
	}

	.two-column .card {
		margin-bottom: 0;
	}

	/* Stats List */
	.stats-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.stat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.stat-item:last-child {
		border-bottom: none;
	}

	.stat-label {
		color: var(--color-text-muted);
	}

	.stat-value {
		font-weight: 600;
		font-size: var(--font-size-lg);
	}

	.stat-value.positive {
		color: var(--color-success);
	}

	.stat-value.negative {
		color: var(--color-error);
	}

	/* Activity List */
	.activity-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.activity-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
	}

	.activity-amount {
		font-weight: 600;
	}

	.activity-amount.succeeded {
		color: var(--color-success);
	}

	.activity-amount.failed {
		color: var(--color-error);
	}

	.activity-time {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-lg);
	}

	/* Quick Actions */
	.quick-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--spacing-md);
	}

	.action-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-lg);
		background: var(--color-surface-variant);
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--color-text);
		font-weight: 500;
		transition: all 0.15s;
	}

	.action-btn:hover {
		background: var(--color-primary);
		color: #0F0F0F;
	}

	.action-btn svg {
		opacity: 0.7;
	}

	.action-btn:hover svg {
		opacity: 1;
	}
</style>
