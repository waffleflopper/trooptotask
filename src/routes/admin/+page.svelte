<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	const totalPending = $derived(data.pendingAccessRequests + data.pendingFeedback);
	const paidCount = $derived(data.tierCounts.team + data.tierCounts.unit);
	const recentPct = $derived(
		data.userStats.total > 0 ? Math.round((data.userStats.last_30_days / data.userStats.total) * 100) : 0
	);
	const maxSignups = $derived(
		data.signupTrend.length > 0 ? Math.max(...data.signupTrend.map((day: { count: number }) => day.count), 1) : 1
	);
	const totalTierOrgs = $derived(data.tierCounts.free + data.tierCounts.team + data.tierCounts.unit);
</script>

<svelte:head>
	<title>Admin Dashboard - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Platform Status</p>
			<h1 class="admin-page-title">Admin Dashboard</h1>
			<p class="admin-page-subtitle">
				Track platform growth, subscription mix, and the trust queue from one place without leaving the control room.
			</p>
		</div>
		<div class="admin-page-actions">
			<Button href="/admin/audit" variant="outline">Audit Log</Button>
			<Button href="/admin/users">Inspect Users</Button>
		</div>
	</header>

	{#if totalPending > 0}
		<div class="dashboard-alerts">
			{#if data.pendingAccessRequests > 0}
				<a href="/admin/access-requests" class="dashboard-alert dashboard-alert--warning">
					<div>
						<p class="dashboard-alert__label">Access Requests</p>
						<strong>{data.pendingAccessRequests} pending review</strong>
					</div>
					<span>Open Queue</span>
				</a>
			{/if}
			{#if data.pendingFeedback > 0}
				<a href="/admin/feedback" class="dashboard-alert dashboard-alert--info">
					<div>
						<p class="dashboard-alert__label">Feedback Queue</p>
						<strong>{data.pendingFeedback} unread item{data.pendingFeedback === 1 ? '' : 's'}</strong>
					</div>
					<span>Review Notes</span>
				</a>
			{/if}
		</div>
	{/if}

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Total Users</p>
			<p class="admin-overview-card__value">{data.userStats.total.toLocaleString()}</p>
			<p class="admin-overview-card__meta">
				+{data.userStats.last_30_days} in the last 30 days ({recentPct}% of all accounts)
			</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Organizations</p>
			<p class="admin-overview-card__value">{data.totalOrganizations.toLocaleString()}</p>
			<p class="admin-overview-card__meta">
				{data.tierCounts.free} free • {data.tierCounts.team} team • {data.tierCounts.unit} unit
			</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Paid Subscriptions</p>
			<p class="admin-overview-card__value">{paidCount.toLocaleString()}</p>
			<p class="admin-overview-card__meta">
				{data.tierCounts.team} team plans and {data.tierCounts.unit} unit plans currently active
			</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Pending Items</p>
			<p class="admin-overview-card__value">{totalPending.toLocaleString()}</p>
			<p class="admin-overview-card__meta">
				{data.pendingAccessRequests} requests and {data.pendingFeedback} feedback items need attention
			</p>
		</div>
	</div>

	<div class="dashboard-grid">
		<section class="admin-panel dashboard-panel dashboard-panel--wide">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Signups</h2>
					<p class="admin-panel__meta">Last 30 days of account creation activity.</p>
				</div>
			</div>
			{#if data.signupTrend.length > 0}
				<div class="signup-chart" aria-label="Signup trend chart">
					{#each data.signupTrend as day (day.date)}
						<div class="signup-chart__col">
							<div
								class="signup-chart__bar"
								style="height: {Math.round((day.count / maxSignups) * 100)}%"
								title="{day.date}: {day.count} signup{day.count === 1 ? '' : 's'}"
							></div>
						</div>
					{/each}
				</div>
				<div class="signup-chart__labels">
					<span>{data.signupTrend[0]?.date?.slice(5) ?? ''}</span>
					<span>{data.signupTrend[data.signupTrend.length - 1]?.date?.slice(5) ?? ''}</span>
				</div>
			{:else}
				<div class="admin-empty">No signup data available.</div>
			{/if}
		</section>

		<section class="admin-panel dashboard-panel">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Subscription Mix</h2>
					<p class="admin-panel__meta">Current organization distribution by plan.</p>
				</div>
			</div>
			<div class="tier-stack">
				<div class="tier-stack__row">
					<span>Free</span>
					<div class="tier-stack__track">
						<div
							class="tier-stack__fill tier-stack__fill--free"
							style="width: {totalTierOrgs > 0 ? Math.round((data.tierCounts.free / totalTierOrgs) * 100) : 0}%"
						></div>
					</div>
					<strong>{data.tierCounts.free}</strong>
				</div>
				<div class="tier-stack__row">
					<span>Team</span>
					<div class="tier-stack__track">
						<div
							class="tier-stack__fill tier-stack__fill--team"
							style="width: {totalTierOrgs > 0 ? Math.round((data.tierCounts.team / totalTierOrgs) * 100) : 0}%"
						></div>
					</div>
					<strong>{data.tierCounts.team}</strong>
				</div>
				<div class="tier-stack__row">
					<span>Unit</span>
					<div class="tier-stack__track">
						<div
							class="tier-stack__fill tier-stack__fill--unit"
							style="width: {totalTierOrgs > 0 ? Math.round((data.tierCounts.unit / totalTierOrgs) * 100) : 0}%"
						></div>
					</div>
					<strong>{data.tierCounts.unit}</strong>
				</div>
			</div>
		</section>
	</div>

	<div class="dashboard-grid">
		<section class="admin-panel dashboard-panel dashboard-panel--wide">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Recent Activity</h2>
					<p class="admin-panel__meta">Most recent audit events entering the platform trail.</p>
				</div>
				<Button href="/admin/audit" variant="outline" size="sm">View Full Log</Button>
			</div>
			{#if data.recentActivity.length > 0}
				<div class="activity-list">
					{#each data.recentActivity as event (event.id)}
						<div class="activity-item">
							<div class="activity-item__main">
								<strong>{event.action}</strong>
								<p>
									{#if event.user_id}
										<span class="admin-code">{event.user_id}</span>
									{:else}
										<span class="text-muted">System event</span>
									{/if}
								</p>
							</div>
							<span class="text-muted">{formatDisplayDateTime(event.timestamp)}</span>
						</div>
					{/each}
				</div>
			{:else}
				<div class="admin-empty">No recent activity.</div>
			{/if}
		</section>

		<section class="admin-panel dashboard-panel">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Quick Actions</h2>
					<p class="admin-panel__meta">Fast paths into the highest-traffic admin workflows.</p>
				</div>
			</div>
			<div class="quick-links">
				<a href="/admin/users" class="quick-links__item">Search Users</a>
				<a href="/admin/organizations" class="quick-links__item">Inspect Orgs</a>
				<a href="/admin/access-requests" class="quick-links__item">Access Queue</a>
				<a href="/admin/feedback" class="quick-links__item">Feedback Queue</a>
				<a href="/admin/subscriptions" class="quick-links__item">Subscriptions</a>
				<a href="/admin/gifting" class="quick-links__item">Gifting</a>
			</div>
		</section>
	</div>
</div>

<style>
	.dashboard-alerts,
	.activity-list,
	.quick-links,
	.tier-stack {
		display: flex;
		flex-direction: column;
	}

	.dashboard-alerts,
	.tier-stack {
		gap: var(--sp-3);
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.8fr) minmax(280px, 1fr);
		gap: var(--sp-4);
	}

	.dashboard-panel--wide {
		min-width: 0;
	}

	.dashboard-alert {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		color: var(--text-primary);
	}

	.dashboard-alert:hover {
		color: var(--text-primary);
		border-color: var(--ink-35);
	}

	.dashboard-alert--warning {
		border-color: color-mix(in srgb, var(--amber-dark) 36%, var(--ink-15) 64%);
		background: color-mix(in srgb, var(--amber-light) 78%, var(--surface-panel) 22%);
	}

	.dashboard-alert--info {
		border-color: color-mix(in srgb, var(--info) 28%, var(--ink-15) 72%);
		background: color-mix(in srgb, var(--info-bg) 80%, var(--surface-panel) 20%);
	}

	.dashboard-alert__label {
		margin: 0 0 var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.dashboard-alert strong {
		font-family: var(--font-display);
		font-size: 1.7rem;
		line-height: 0.96;
		text-transform: uppercase;
	}

	.dashboard-alert span:last-child {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.signup-chart {
		height: 220px;
		display: grid;
		grid-template-columns: repeat(30, minmax(0, 1fr));
		align-items: end;
		gap: 6px;
		padding: var(--sp-3) 0;
	}

	.signup-chart__col {
		height: 100%;
		display: flex;
		align-items: end;
	}

	.signup-chart__bar {
		width: 100%;
		min-height: 6px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--amber-dark) 82%, var(--info) 18%);
	}

	.signup-chart__labels {
		display: flex;
		justify-content: space-between;
		margin-top: var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}

	.tier-stack__row {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
		font-size: var(--text-sm);
	}

	.tier-stack__row span:first-child,
	.tier-stack__row strong {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.tier-stack__track {
		height: 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface-subtle) 82%, var(--surface-panel) 18%);
		overflow: hidden;
	}

	.tier-stack__fill {
		height: 100%;
		border-radius: inherit;
	}

	.tier-stack__fill--free {
		background: var(--ink-35);
	}

	.tier-stack__fill--team {
		background: var(--info);
	}

	.tier-stack__fill--unit {
		background: var(--amber-dark);
	}

	.activity-list {
		gap: var(--sp-2);
	}

	.activity-item {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3) 0;
		border-top: var(--border-rule);
	}

	.activity-item:first-child {
		border-top: none;
		padding-top: 0;
	}

	.activity-item:last-child {
		padding-bottom: 0;
	}

	.activity-item__main {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 0;
	}

	.activity-item__main strong,
	.activity-item__main p {
		margin: 0;
	}

	.quick-links {
		gap: var(--sp-2);
	}

	.quick-links__item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.9rem 1rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.quick-links__item:hover {
		color: var(--text-primary);
		border-color: var(--ink-35);
	}

	@media (max-width: 900px) {
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
