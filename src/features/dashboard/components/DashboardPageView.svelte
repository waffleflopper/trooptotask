<script lang="ts">
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { RATING_STATUS_COLORS } from '$features/rating-scheme/rating-scheme.types';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import GettingStartedBanner from '$features/onboarding/components/GettingStartedBanner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { HALF_SIZE_CARDS } from '../contexts/DashboardContext.svelte';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';
	import type { CardId } from '$lib/stores/dashboardPrefs.svelte';

	let { ctx }: { ctx: DashboardContext } = $props();

	// Convenience alias — ctx.data is DashboardPageData with full types
	const data = ctx.data;
</script>

<svelte:head>
	<title>{data.orgName} - Dashboard - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Dashboard" helpTopic="dashboard">
		<button class="btn-ghost" onclick={() => ctx.openCustomizeModal()}>Customize</button>
	</PageToolbar>
	<main class="dashboard">
		<!-- Header -->
		<div class="dashboard-header">
			<div class="dashboard-title">
				<h2>{data.orgName}</h2>
				<p class="greeting">
					Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}
				</p>
			</div>
			<div class="dashboard-date">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="date-icon">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
				<span>{ctx.todayDisplay}</span>
			</div>
		</div>

		{#if !ctx.bannerDismissed}
			<div class="welcome-banner">
				<div class="welcome-content">
					<strong>Welcome to Troop to Task!</strong>
					<span class="welcome-text">New here? Check out the platform guide to learn what you can do.</span>
					<a href="/help" class="btn btn-sm btn-primary welcome-btn">View Guide</a>
				</div>
				<button class="welcome-dismiss" onclick={() => ctx.dismissBanner()} aria-label="Dismiss welcome banner">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
		{/if}

		{#if (ctx.userRole === 'owner' || ctx.userRole === 'admin') && !ctx.isDemoSandbox && !ctx.isDemoReadOnly}
			<GettingStartedBanner
				orgId={data.orgId}
				personnelCount={ctx.personnelCount}
				statusTypeCount={ctx.statusTypeCount}
				trainingTypeCount={ctx.trainingTypeCount}
				assignmentTypeCount={ctx.assignmentTypeCount}
				onboardingTemplateStepCount={data.onboardingTemplateStepCount}
				ratingSchemeEntryCount={data.ratingSchemeEntryCount}
				orgMemberCount={data.orgMemberCount}
				dismissed={ctx.gettingStartedDismissed}
				onDismiss={() => ctx.dismissGettingStarted()}
			/>
		{/if}

		<!-- Dynamic card layout -->
		{#each ctx.cardRows as row (row.join('-'))}
			{#if row.length === 2}
				<div class="card-row">
					{#each row as cardId (cardId)}
						{@render cardContent(cardId)}
					{/each}
				</div>
			{:else if HALF_SIZE_CARDS.includes(row[0])}
				<div class="card-row card-row--single">
					{@render cardContent(row[0])}
				</div>
			{:else}
				{@render cardContent(row[0])}
			{/if}
		{:else}
			{#if ctx.allowedCards.length === 0}
				<EmptyState
					message="Your current permissions don't include dashboard access. Contact your organization admin."
				/>
			{:else}
				<EmptyState message="No cards visible — open Customize to restore them." />
			{/if}
		{/each}
	</main>
</div>

{#snippet cardContent(cardId: CardId)}
	{#if cardId === 'strength'}
		<!-- Today's Strength -->
		<div class="card">
			<div class="card-header">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
					<path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
				Today's Strength
			</div>
			<div class="card-body">
				<div class="strength-numbers">
					<div class="strength-main">
						<span class="strength-value">{ctx.availableCount}</span>
						<span class="strength-label">available</span>
					</div>
					<div class="strength-divider">/</div>
					<div class="strength-total">
						<span class="strength-value strength-value--muted">{ctx.totalPersonnel}</span>
						<span class="strength-label">total</span>
					</div>
				</div>

				<div class="strength-bar-wrap">
					<div class="strength-bar">
						<div
							class="strength-bar-fill"
							style="width: {ctx.dutyStrengthPct}%; background: {ctx.dutyStrengthPct >= 80
								? 'var(--color-success)'
								: ctx.dutyStrengthPct >= 60
									? 'var(--color-warning)'
									: 'var(--color-error)'}"
						></div>
					</div>
					<span class="strength-pct">{ctx.dutyStrengthPct}% present</span>
				</div>

				{#if ctx.statusBreakdown.size > 0}
					<div class="status-chips">
						{#each [...ctx.statusBreakdown.entries()] as [, info]}
							<span class="status-chip" style="background: {info.color}; color: {info.textColor}">
								{info.count}
								{info.name}
							</span>
						{/each}
					</div>
				{:else}
					<p class="empty-note">All personnel present</p>
				{/if}
			</div>
		</div>
	{:else if cardId === 'duty'}
		<!-- Today's Duty Assignments -->
		<div class="card">
			<div class="card-header">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
					<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
					<path d="M9 14l2 2 4-4" />
				</svg>
				Today's Duty Assignments
			</div>
			<div class="card-body">
				{#if ctx.dutyAssignments.length > 0}
					<div class="duty-list">
						{#each ctx.dutyAssignments as assignment}
							<div class="duty-item">
								<span class="duty-badge" style="background: {assignment.color}"
									>{assignment.shortName || assignment.typeName}</span
								>
								<span class="duty-assignee">{assignment.assigneeName || 'Unassigned'}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="empty-state">
						<p>No assignments today</p>
						<a href="/org/{data.orgId}/calendar" class="btn btn-text btn-sm">Manage in Calendar</a>
					</div>
				{/if}
			</div>
		</div>
	{:else if cardId === 'training'}
		<!-- Training Status -->
		<div class="card">
			<div class="card-header">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
					<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
				</svg>
				Training Status
			</div>
			<div class="card-body">
				{#if ctx.trainingStats === null}
					<div class="empty-state">
						<p>No training types configured</p>
						{#if ctx.data.permissions?.canEditTraining}
							<a href="/org/{data.orgId}/training" class="btn btn-text btn-sm">Set Up Training</a>
						{/if}
					</div>
				{:else}
					<div class="training-stats">
						<div class="training-stat training-stat--expired">
							<span class="training-stat-value">{ctx.trainingStats.expired}</span>
							<span class="training-stat-label">Expired</span>
						</div>
						<div class="training-stat training-stat--orange">
							<span class="training-stat-value">{ctx.trainingStats.warningOrange}</span>
							<span class="training-stat-label">Expiring Soon</span>
						</div>
						<div class="training-stat training-stat--yellow">
							<span class="training-stat-value">{ctx.trainingStats.warningYellow}</span>
							<span class="training-stat-label">Due Soon</span>
						</div>
						<div class="training-stat training-stat--current">
							<span class="training-stat-value">{ctx.trainingStats.current}</span>
							<span class="training-stat-label">Current</span>
						</div>
					</div>

					{#if ctx.topTrainingIssues.length > 0}
						<div class="training-issues">
							<p class="issues-label">Needs attention:</p>
							{#each ctx.topTrainingIssues as issue}
								<div class="issue-row">
									<span class="issue-name">{issue.personName}</span>
									<span class="issue-type">{issue.typeName}</span>
									<span
										class="issue-badge"
										class:expired={issue.status === 'expired'}
										class:warning={issue.status === 'warning-orange'}
									>
										{issue.label}
									</span>
								</div>
							{/each}
						</div>
					{/if}

					<div class="card-link">
						<a href="/org/{data.orgId}/training" class="btn btn-text btn-sm">View Full Training Report</a>
					</div>
				{/if}
			</div>
		</div>
	{:else if cardId === 'upcoming'}
		<!-- Upcoming Changes -->
		<div class="card">
			<div class="card-header">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<polyline points="12 6 12 12 16 14" />
				</svg>
				Upcoming (Next 7 Days)
			</div>
			<div class="card-body">
				{#if ctx.upcomingByDate.size === 0}
					<div class="empty-state">
						<p>No changes in the next 7 days</p>
						<a href="/org/{data.orgId}/calendar" class="btn btn-text btn-sm">View Calendar</a>
					</div>
				{:else}
					<div class="upcoming-list">
						{#each [...ctx.upcomingByDate.entries()] as [date, changes]}
							<div class="upcoming-group">
								<div class="upcoming-date">{ctx.formatShortDate(date)}</div>
								{#each changes as change}
									<div class="upcoming-item">
										<span class="upcoming-dot" style="background: {change.statusColor}"></span>
										<span class="upcoming-person">{change.personName}</span>
										<span
											class="upcoming-direction"
											class:departing={change.direction === 'departing'}
											class:returning={change.direction === 'returning'}
										>
											{change.direction === 'departing' ? 'starts' : 'returns'} — {change.statusName}
										</span>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{:else if cardId === 'ratings'}
		<!-- Rating Scheme -->
		<div class="card">
			<div class="card-header">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 20h9" />
					<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
				</svg>
				Rating Scheme
			</div>
			<div class="card-body">
				{#if ctx.ratingTotal === 0}
					<div class="empty-state">
						<p>No active rating entries</p>
						<a href="/org/{data.orgId}/personnel" class="btn btn-text btn-sm">Go to Personnel</a>
					</div>
				{:else}
					<div class="rating-stats">
						<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.overdue}">
							<span class="rating-stat-value">{ctx.ratingStats.overdue}</span>
							<span class="rating-stat-label">Overdue</span>
						</div>
						<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS['due-30']}">
							<span class="rating-stat-value">{ctx.ratingStats['due-30']}</span>
							<span class="rating-stat-label">Due 30d</span>
						</div>
						<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS['due-60']}">
							<span class="rating-stat-value">{ctx.ratingStats['due-60']}</span>
							<span class="rating-stat-label">Due 60d</span>
						</div>
						<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.current}">
							<span class="rating-stat-value">{ctx.ratingStats.current}</span>
							<span class="rating-stat-label">Current</span>
						</div>
					</div>

					<div class="card-link">
						<a href="/org/{data.orgId}/personnel" class="btn btn-text btn-sm">View Rating Scheme</a>
					</div>
				{/if}
			</div>
		</div>
	{:else if cardId === 'onboardings'}
		<!-- Active Onboardings -->
		{#if ctx.data.permissions?.canViewPersonnel}
			<div class="card card--full">
				<div class="card-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
						<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
						<line x1="9" y1="12" x2="15" y2="12" />
						<line x1="9" y1="16" x2="15" y2="16" />
					</svg>
					Active Onboardings
					{#if ctx.activeOnboardings.length > 0}
						<span class="header-count">{ctx.activeOnboardings.length}</span>
					{/if}
					<div class="spacer"></div>
					<a href="/org/{data.orgId}/onboarding" class="btn btn-text btn-sm">View All</a>
				</div>
				<div class="card-body">
					{#if ctx.activeOnboardings.length > 0}
						<div class="onboarding-list">
							{#each ctx.activeOnboardings as ob}
								<div class="onboarding-item">
									<span class="onboarding-name">{ob.personName}</span>
									<div class="onboarding-progress-wrap">
										<div class="onboarding-bar">
											<div class="onboarding-bar-fill" style="width: {ob.pct}%"></div>
										</div>
										<span class="onboarding-steps">{ob.completedSteps}/{ob.totalSteps}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<p>No active onboardings</p>
							<a href="/org/{data.orgId}/onboarding" class="btn btn-text btn-sm">Go to Onboarding</a>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{:else if cardId === 'groups'}
		<!-- Per-Group Breakdown -->
		{#if ctx.groupBreakdown.length > 0}
			<div class="card card--full">
				<div class="card-header">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
						<path d="M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
					Per-Group Breakdown
				</div>
				<div class="card-body card-body--no-pad">
					<div class="group-table-wrap">
						<table class="group-table">
							<thead>
								<tr>
									<th class="col-group">Group</th>
									<th class="col-num">Total</th>
									<th class="col-num">Present</th>
									{#each statusTypesStore.items as st}
										<th class="col-num col-status" style="color: {st.color}">{st.name}</th>
									{/each}
									<th class="col-num">%</th>
								</tr>
							</thead>
							<tbody>
								{#each ctx.groupBreakdown as group}
									<tr class:pinned={group.isPinned}>
										<td class="col-group">
											{#if group.isPinned}
												<svg class="pin-icon" viewBox="0 0 24 24" fill="currentColor">
													<path
														d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6zm0 8c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2z"
													/>
												</svg>
											{/if}
											{group.name}
										</td>
										<td class="col-num">{group.total}</td>
										<td class="col-num col-present">{group.available}</td>
										{#each statusTypesStore.items as st}
											<td class="col-num">
												{#if (group.statusCounts.get(st.id) ?? 0) > 0}
													<span class="table-chip" style="background: {st.color}; color: {st.textColor}">
														{group.statusCounts.get(st.id)}
													</span>
												{:else}
													<span class="col-zero">—</span>
												{/if}
											</td>
										{/each}
										<td class="col-num">
											<span
												class="pct-badge"
												class:pct-high={group.pct >= 80}
												class:pct-mid={group.pct >= 60 && group.pct < 80}
												class:pct-low={group.pct < 60}
											>
												{group.pct}%
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{/if}
	{/if}
{/snippet}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.dashboard {
		flex: 1;
		padding: var(--spacing-lg);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	/* Dashboard Header */
	.dashboard-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.dashboard-title h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-2xl);
		font-weight: 400;
		color: var(--color-text);
		line-height: 1.2;
	}

	.greeting {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	.dashboard-date {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		white-space: nowrap;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border-radius: 6px;
		border: 1px solid var(--color-border);
	}

	.date-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	/* Card Row */
	.card-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-lg);
	}

	.card--full {
		width: 100%;
	}

	.card-row--single {
		grid-template-columns: 1fr;
	}

	/* Card Header Override */
	.card-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
	}

	.card-header svg {
		width: 18px;
		height: 18px;
		color: #b8943e;
		flex-shrink: 0;
	}

	/* Strength Card */
	.strength-numbers {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.strength-main,
	.strength-total {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.strength-value {
		font-family: var(--font-mono);
		font-size: 2.5rem;
		font-weight: 500;
		color: var(--color-text);
		line-height: 1;
	}

	.strength-value--muted {
		color: var(--color-text-muted);
		font-size: 2rem;
	}

	.strength-divider {
		font-family: var(--font-mono);
		font-size: 2rem;
		color: var(--color-text-muted);
		line-height: 1;
		padding-top: 2px;
	}

	.strength-label {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 2px;
	}

	.strength-bar-wrap {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.strength-bar {
		flex: 1;
		height: 8px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.strength-bar-fill {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
	}

	.strength-pct {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.status-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.status-chip {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 500;
	}

	.empty-note {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Welcome Banner */
	.welcome-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-primary);
		color: white;
		border-radius: var(--radius-md);
	}

	.welcome-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.welcome-text {
		font-size: var(--font-size-sm);
		opacity: 0.9;
	}

	.welcome-btn {
		background: white;
		color: var(--color-primary);
		white-space: nowrap;
	}

	.welcome-dismiss {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		opacity: 0.8;
		flex-shrink: 0;
	}

	.welcome-dismiss:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.15);
	}

	.welcome-dismiss svg {
		width: 18px;
		height: 18px;
		display: block;
	}

	/* Duty Card */
	.duty-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.duty-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.duty-badge {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: white;
		white-space: nowrap;
	}

	.duty-assignee {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	/* Training Card */
	.training-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.training-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-sm);
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
	}

	.training-stat-value {
		font-family: var(--font-mono);
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1;
	}

	.training-stat-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: 2px;
		text-align: center;
	}

	.training-stat--expired .training-stat-value {
		color: var(--color-error);
	}

	.training-stat--orange .training-stat-value {
		color: var(--color-warning);
	}

	.training-stat--yellow .training-stat-value {
		color: #b8943e;
	}

	.training-stat--current .training-stat-value {
		color: var(--color-success);
	}

	.training-issues {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: var(--spacing-sm);
	}

	.issues-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 2px;
	}

	.issue-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.issue-name {
		font-weight: 500;
		color: var(--color-text);
		min-width: 100px;
	}

	.issue-type {
		flex: 1;
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
	}

	.issue-badge {
		padding: 1px var(--spacing-xs);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		font-weight: 500;
	}

	.issue-badge.expired {
		background: rgba(244, 67, 54, 0.12);
		color: var(--color-error);
	}

	.issue-badge.warning {
		background: rgba(255, 152, 0, 0.12);
		color: var(--color-warning);
	}

	.card-link {
		margin-top: var(--spacing-sm);
	}

	/* Upcoming Card */
	.upcoming-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 260px;
		overflow-y: auto;
	}

	.upcoming-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.upcoming-date {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #b8943e;
		padding: 2px 0;
		border-bottom: 1px solid var(--color-divider);
		margin-bottom: 2px;
	}

	.upcoming-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 2px 0;
		font-size: var(--font-size-sm);
	}

	.upcoming-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.upcoming-person {
		font-weight: 500;
		color: var(--color-text);
		min-width: 100px;
	}

	.upcoming-direction {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.upcoming-direction.departing {
		color: var(--color-error);
	}

	.upcoming-direction.returning {
		color: var(--color-success);
	}

	/* Rating Card */
	.rating-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.rating-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-sm);
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		border-top: 3px solid var(--stat-color, var(--color-border));
	}

	.rating-stat-value {
		font-family: var(--font-mono);
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--stat-color, var(--color-text));
		line-height: 1;
	}

	.rating-stat-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: 2px;
		text-align: center;
	}

	/* Onboarding Card */
	.onboarding-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.onboarding-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.onboarding-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
		min-width: 160px;
	}

	.onboarding-progress-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.onboarding-bar {
		flex: 1;
		height: 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.onboarding-bar-fill {
		height: 100%;
		background: var(--color-primary);
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
	}

	.onboarding-steps {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	/* Header count badge */
	.header-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--color-primary);
		color: white;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 600;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
	}

	/* Group Table */
	.group-table-wrap {
		overflow-x: auto;
	}

	.group-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.group-table th {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
		padding: var(--spacing-xs) var(--spacing-sm);
		text-align: left;
		border-bottom: 1px solid var(--color-divider);
	}

	.group-table td {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-bottom: 1px solid var(--color-divider);
		color: var(--color-text);
	}

	.group-table tr:last-child td {
		border-bottom: none;
	}

	.group-table tr.pinned {
		background: var(--color-surface-variant);
	}

	.col-group {
		min-width: 120px;
	}

	.col-num {
		text-align: center;
		width: 60px;
	}

	.col-status {
		font-weight: 500;
	}

	.col-present {
		font-weight: 600;
		color: var(--color-success);
	}

	.col-zero {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.table-chip {
		display: inline-block;
		padding: 1px 6px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 500;
	}

	.pct-badge {
		display: inline-block;
		padding: 1px 6px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: 500;
		background: var(--color-surface-variant);
	}

	.pct-high {
		background: rgba(76, 175, 80, 0.15);
		color: var(--color-success);
	}

	.pct-mid {
		background: rgba(255, 152, 0, 0.15);
		color: var(--color-warning);
	}

	.pct-low {
		background: rgba(244, 67, 54, 0.12);
		color: var(--color-error);
	}

	.pin-icon {
		width: 12px;
		height: 12px;
		color: #b8943e;
		display: inline-block;
		vertical-align: middle;
		margin-right: 2px;
	}

	/* Empty state inside cards */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-lg);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-align: center;
	}

	.empty-state p {
		margin: 0;
	}
</style>
