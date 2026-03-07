<script lang="ts">
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();
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

		<div class="metric-card">
			<div class="metric-value">{data.metrics.totalOrganizations}</div>
			<div class="metric-label">Organizations</div>
		</div>

		<div class="metric-card">
			<div class="metric-value">+{data.metrics.newUsersThisMonth}</div>
			<div class="metric-label">New This Month</div>
		</div>
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
			<a href="/admin/access-requests" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
					<polyline points="22,6 12,13 2,6"></polyline>
				</svg>
				Access Requests
			</a>
			<a href="/admin/feedback" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
				</svg>
				Feedback
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

	.metric-value {
		font-size: var(--font-size-3xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
	}

	.metric-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-top: var(--spacing-xs);
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
