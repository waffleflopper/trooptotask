<script lang="ts">
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	const totalPending = $derived(data.pendingAccessRequests + data.pendingFeedback);
	const paidCount = $derived(data.tierCounts.team + data.tierCounts.unit);
	const recentPct = $derived(
		data.userStats.total > 0
			? Math.round((data.userStats.last_30_days / data.userStats.total) * 100)
			: 0
	);

	// Bar chart: compute max for proportional heights
	const maxSignups = $derived(
		data.signupTrend.length > 0
			? Math.max(...data.signupTrend.map((d: { count: number }) => d.count), 1)
			: 1
	);

	const totalTierOrgs = $derived(
		data.tierCounts.free + data.tierCounts.team + data.tierCounts.unit
	);
</script>

<svelte:head>
	<title>Admin Dashboard - Troop to Task</title>
</svelte:head>

<div class="admin-dashboard">
	<header class="page-header">
		<h1>Dashboard</h1>
		<p class="subtitle">Platform overview and key metrics</p>
	</header>

	{#if totalPending > 0}
		<div class="alert-banners">
			{#if data.pendingAccessRequests > 0}
				<a href="/admin/access-requests" class="alert-banner">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
						<circle cx="9" cy="7" r="4"></circle>
						<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
					</svg>
					<span>{data.pendingAccessRequests} pending access request{data.pendingAccessRequests === 1 ? '' : 's'}</span>
					<span class="alert-action">Review →</span>
				</a>
			{/if}
			{#if data.pendingFeedback > 0}
				<a href="/admin/feedback" class="alert-banner alert-banner--feedback">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
					</svg>
					<span>{data.pendingFeedback} unread feedback item{data.pendingFeedback === 1 ? '' : 's'}</span>
					<span class="alert-action">Review →</span>
				</a>
			{/if}
		</div>
	{/if}

	<!-- Stat Cards -->
	<div class="stat-grid">
		<div class="stat-card">
			<div class="stat-value">{data.userStats.total.toLocaleString()}</div>
			<div class="stat-label">Total Users</div>
			<div class="stat-sub">+{data.userStats.last_30_days} in last 30 days ({recentPct}%)</div>
		</div>

		<div class="stat-card">
			<div class="stat-value">{data.totalOrganizations.toLocaleString()}</div>
			<div class="stat-label">Organizations</div>
			<div class="stat-sub">{data.tierCounts.free} free · {data.tierCounts.team} team · {data.tierCounts.unit} unit</div>
		</div>

		<div class="stat-card stat-card--highlight">
			<div class="stat-value">{paidCount.toLocaleString()}</div>
			<div class="stat-label">Paid Subscriptions</div>
			<div class="stat-sub">{data.tierCounts.team} Team · {data.tierCounts.unit} Unit</div>
		</div>

		<div class="stat-card stat-card--pending">
			<div class="stat-value">{totalPending.toLocaleString()}</div>
			<div class="stat-label">Pending Items</div>
			<div class="stat-sub">
				<a href="/admin/access-requests">{data.pendingAccessRequests} requests</a>
				·
				<a href="/admin/feedback">{data.pendingFeedback} feedback</a>
			</div>
		</div>
	</div>

	<!-- Charts Row -->
	<div class="charts-row">
		<!-- Signup Trend Bar Chart -->
		<section class="card chart-card chart-card--wide">
			<h2>Signups — Last 30 Days</h2>
			{#if data.signupTrend.length > 0}
				<div class="bar-chart">
					{#each data.signupTrend as day (day.date)}
						<div class="bar-col">
							<div
								class="bar"
								style="height: {Math.round((day.count / maxSignups) * 100)}%"
								title="{day.date}: {day.count} signup{day.count === 1 ? '' : 's'}"
							></div>
						</div>
					{/each}
				</div>
				<div class="bar-chart-labels">
					<span class="chart-label-left">{data.signupTrend[0]?.date?.slice(5) ?? ''}</span>
					<span class="chart-label-right">{data.signupTrend[data.signupTrend.length - 1]?.date?.slice(5) ?? ''}</span>
				</div>
			{:else}
				<p class="chart-empty">No signup data available.</p>
			{/if}
		</section>

		<!-- Subscription Mix -->
		<section class="card chart-card chart-card--narrow">
			<h2>Subscription Mix</h2>
			<div class="tier-bars">
				<div class="tier-row">
					<span class="tier-label">Free</span>
					<div class="tier-track">
						<div
							class="tier-fill tier-fill--free"
							style="width: {totalTierOrgs > 0 ? Math.round((data.tierCounts.free / totalTierOrgs) * 100) : 0}%"
						></div>
					</div>
					<span class="tier-count">{data.tierCounts.free}</span>
				</div>
				<div class="tier-row">
					<span class="tier-label">Team</span>
					<div class="tier-track">
						<div
							class="tier-fill tier-fill--team"
							style="width: {totalTierOrgs > 0 ? Math.round((data.tierCounts.team / totalTierOrgs) * 100) : 0}%"
						></div>
					</div>
					<span class="tier-count">{data.tierCounts.team}</span>
				</div>
				<div class="tier-row">
					<span class="tier-label">Unit</span>
					<div class="tier-track">
						<div
							class="tier-fill tier-fill--unit"
							style="width: {totalTierOrgs > 0 ? Math.round((data.tierCounts.unit / totalTierOrgs) * 100) : 0}%"
						></div>
					</div>
					<span class="tier-count">{data.tierCounts.unit}</span>
				</div>
			</div>
		</section>
	</div>

	<!-- Recent Activity Feed -->
	<section class="card">
		<div class="card-header">
			<h2>Recent Activity</h2>
			<a href="/admin/audit" class="card-link">View full audit log →</a>
		</div>
		{#if data.recentActivity.length > 0}
			<ul class="activity-list">
				{#each data.recentActivity as event (event.id)}
					<li class="activity-item">
						<div class="activity-action">{event.action}</div>
						<div class="activity-meta">
							{#if event.user_id}
								<span class="activity-user">{event.user_id}</span>
								·
							{/if}
							<span class="activity-time">{formatDisplayDateTime(event.timestamp)}</span>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="chart-empty">No recent activity.</p>
		{/if}
	</section>

	<!-- Quick Actions -->
	<section class="card">
		<h2>Quick Actions</h2>
		<div class="quick-actions">
			<a href="/admin/users" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8"></circle>
					<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
				</svg>
				Search Users
			</a>
			<a href="/admin/access-requests" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
					<circle cx="9" cy="7" r="4"></circle>
				</svg>
				Access Requests
			</a>
			<a href="/admin/feedback" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
				</svg>
				Feedback
			</a>
			<a href="/admin/audit" class="action-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

	/* Header */
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

	/* Alert Banners */
	.alert-banners {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
	}

	.alert-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-warning-bg, #fef3c7);
		border: 1px solid var(--color-warning, #fcd34d);
		border-radius: var(--radius-md);
		color: #92400e;
		font-weight: 500;
		font-size: var(--font-size-sm);
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.alert-banner:hover {
		opacity: 0.85;
	}

	.alert-banner--feedback {
		background: #eff6ff;
		border-color: #93c5fd;
		color: #1e40af;
	}

	:global([data-theme='dark']) .alert-banner {
		background: #451a03;
		border-color: #92400e;
		color: #fcd34d;
	}

	:global([data-theme='dark']) .alert-banner--feedback {
		background: #1e3a5f;
		border-color: #2563eb;
		color: #93c5fd;
	}

	.alert-action {
		margin-left: auto;
		font-weight: 600;
		color: var(--color-primary);
	}

	/* Stat Cards */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-xl);
	}

	.stat-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.stat-card--highlight {
		border-color: var(--color-primary);
	}

	.stat-card--pending {
		border-color: var(--color-warning, #fcd34d);
	}

	.stat-value {
		font-size: var(--font-size-3xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.1;
	}

	.stat-label {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-top: var(--spacing-xs);
	}

	.stat-sub {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: var(--spacing-xs);
	}

	.stat-sub a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.stat-sub a:hover {
		text-decoration: underline;
	}

	/* Charts Row */
	.charts-row {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	@media (max-width: 768px) {
		.charts-row {
			grid-template-columns: 1fr;
		}
	}

	/* Card base */
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.card h2 {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	.chart-card {
		margin-bottom: 0;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.card-header h2 {
		margin-bottom: 0;
	}

	.card-link {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		text-decoration: none;
	}

	.card-link:hover {
		text-decoration: underline;
	}

	/* Bar Chart */
	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 120px;
		padding-bottom: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
	}

	.bar-col {
		flex: 1;
		display: flex;
		align-items: flex-end;
		height: 100%;
	}

	.bar {
		width: 100%;
		background: var(--color-primary);
		border-radius: 2px 2px 0 0;
		min-height: 2px;
		opacity: 0.8;
		transition: opacity 0.15s;
		cursor: default;
	}

	.bar:hover {
		opacity: 1;
	}

	.bar-chart-labels {
		display: flex;
		justify-content: space-between;
		margin-top: var(--spacing-xs);
	}

	.chart-label-left,
	.chart-label-right {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.chart-empty {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Tier Bars */
	.tier-bars {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.tier-row {
		display: grid;
		grid-template-columns: 40px 1fr 32px;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.tier-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.tier-track {
		height: 10px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.tier-fill {
		height: 100%;
		border-radius: var(--radius-full);
		min-width: 2px;
		transition: width 0.3s ease;
	}

	.tier-fill--free {
		background: var(--color-text-muted);
	}

	.tier-fill--team {
		background: var(--color-primary);
	}

	.tier-fill--unit {
		background: var(--color-success);
	}

	.tier-count {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		text-align: right;
	}

	/* Activity Feed */
	.activity-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.activity-item {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-divider);
	}

	.activity-item:last-child {
		border-bottom: none;
	}

	.activity-action {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		font-weight: 500;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.activity-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.activity-user {
		color: var(--color-text-secondary);
	}

	/* Quick Actions */
	.quick-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
		font-size: var(--font-size-sm);
		transition: all 0.15s;
	}

	.action-btn:hover {
		background: var(--color-primary);
		color: white;
	}

	.action-btn svg {
		opacity: 0.7;
	}

	.action-btn:hover svg {
		opacity: 1;
	}
</style>
