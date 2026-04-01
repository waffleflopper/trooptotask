<script lang="ts">
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { RATING_STATUS_COLORS } from '$features/rating-scheme/rating-scheme.types';
	import GettingStartedBanner from '$features/onboarding/components/GettingStartedBanner.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { CardId } from '$lib/stores/dashboardPrefs.svelte';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';

	let { ctx }: { ctx: DashboardContext } = $props();

	const greeting = $derived.by(() => {
		const hour = new Date().getHours();
		if (hour < 12) return 'morning';
		if (hour < 17) return 'afternoon';
		return 'evening';
	});

	const statusBreakdown = $derived.by(() => [...ctx.statusBreakdown.values()]);
	const trainingAttentionCount = $derived.by(() =>
		ctx.trainingStats
			? ctx.trainingStats.expired + ctx.trainingStats.warningOrange + ctx.trainingStats.warningYellow
			: 0
	);
</script>

<svelte:head>
	<title>{ctx.data.orgName} - Dashboard - Troop to Task</title>
</svelte:head>

<div class="dashboard-page">
	<PageToolbar title="Dashboard" subtitle="Daily readiness and tasking snapshot" helpTopic="dashboard">
		<a class="btn btn-secondary btn-sm" href="/help">Field Guide</a>
		<button class="btn btn-secondary btn-sm" onclick={() => ctx.openCustomizeModal()}>Customize</button>
	</PageToolbar>

	<main class="dashboard-shell">
		<section class="dashboard-briefing">
			<div class="briefing-header">
				<div class="briefing-copy">
					<p class="section-kicker">Daily Brief</p>
					<h2>{ctx.data.orgName}</h2>
					<p>Good {greeting}. Review readiness, tasking, and follow-up items before the next formation.</p>
				</div>

				<div class="briefing-date" aria-label="Current date">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="date-icon">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
						<line x1="16" y1="2" x2="16" y2="6" />
						<line x1="8" y1="2" x2="8" y2="6" />
						<line x1="3" y1="10" x2="21" y2="10" />
					</svg>
					<span>{ctx.todayDisplay}</span>
				</div>
			</div>

			<dl class="briefing-metrics">
				<div class="briefing-metric">
					<dt>Ready Now</dt>
					<dd>{ctx.availableCount}/{ctx.totalPersonnel}</dd>
					<span>{ctx.dutyStrengthPct}% present today</span>
				</div>
				<div class="briefing-metric">
					<dt>Tasked</dt>
					<dd>{ctx.dutyAssignments.length}</dd>
					<span>{ctx.dutyAssignments.length === 1 ? 'assignment posted' : 'assignments posted'}</span>
				</div>
				<div class="briefing-metric" class:attention={trainingAttentionCount > 0}>
					<dt>Training Watch</dt>
					<dd>{trainingAttentionCount}</dd>
					<span>{trainingAttentionCount === 1 ? 'record needs action' : 'records need action'}</span>
				</div>
				<div class="briefing-metric" class:attention={ctx.upcomingChanges.length > 0}>
					<dt>Movement</dt>
					<dd>{ctx.upcomingChanges.length}</dd>
					<span>changes in the next 7 days</span>
				</div>
			</dl>
		</section>

		{#if !ctx.bannerDismissed}
			<section class="dashboard-notice">
				<div class="notice-copy">
					<p class="section-kicker">Field Guide</p>
					<h3>New to the workspace?</h3>
					<p>Open the platform guide for a quick walkthrough of the core jobs you can do from the dashboard.</p>
				</div>
				<div class="notice-actions">
					<a href="/help" class="btn btn-amber btn-sm">Open Guide</a>
					<button class="btn btn-secondary btn-sm" onclick={() => ctx.dismissBanner()}>Dismiss</button>
				</div>
			</section>
		{/if}

		{#if (ctx.userRole === 'owner' || ctx.userRole === 'admin') && !ctx.isDemoSandbox && !ctx.isDemoReadOnly}
			<div class="dashboard-stack">
				<GettingStartedBanner
					orgId={ctx.data.orgId}
					personnelCount={ctx.personnelCount}
					statusTypeCount={ctx.statusTypeCount}
					trainingTypeCount={ctx.trainingTypeCount}
					assignmentTypeCount={ctx.assignmentTypeCount}
					onboardingTemplateStepCount={ctx.data.onboardingTemplateStepCount}
					ratingSchemeEntryCount={ctx.data.ratingSchemeEntryCount}
					orgMemberCount={ctx.data.orgMemberCount}
					dismissed={ctx.gettingStartedDismissed}
					onDismiss={() => ctx.dismissGettingStarted()}
				/>
			</div>
		{/if}

		{#each ctx.cardRows as row (row.join('-'))}
			<div class="module-row" class:module-row--paired={row.length === 2}>
				{#each row as cardId (cardId)}
					{@render cardContent(cardId)}
				{/each}
			</div>
		{:else}
			<div class="dashboard-empty">
				{#if ctx.allowedCards.length === 0}
					<EmptyState
						message="Your current permissions do not include dashboard access. Contact your organization admin."
					/>
				{:else}
					<EmptyState message="No dashboard modules are visible. Use Customize to restore the default layout." />
				{/if}
			</div>
		{/each}
	</main>
</div>

{#snippet cardContent(cardId: CardId)}
	{#if cardId === 'strength'}
		<section class="dashboard-module">
			<header class="module-header">
				<div class="module-heading">
					<span class="module-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</span>
					<div>
						<p class="module-kicker">Personnel</p>
						<h3>Today's strength</h3>
					</div>
				</div>
			</header>

			<div class="module-body">
				<div class="strength-grid">
					<div class="strength-figure">
						<span class="strength-number">{ctx.availableCount}</span>
						<span class="strength-meta">available now</span>
					</div>

					<dl class="strength-facts">
						<div>
							<dt>Total roster</dt>
							<dd>{ctx.totalPersonnel}</dd>
						</div>
						<div>
							<dt>Unavailable</dt>
							<dd>{ctx.totalPersonnel - ctx.availableCount}</dd>
						</div>
					</dl>
				</div>

				<div class="meter-row">
					<div class="meter-track" aria-hidden="true">
						<div
							class="meter-fill"
							class:meter-fill--good={ctx.dutyStrengthPct >= 80}
							class:meter-fill--watch={ctx.dutyStrengthPct >= 60 && ctx.dutyStrengthPct < 80}
							class:meter-fill--risk={ctx.dutyStrengthPct < 60}
							style="width: {ctx.dutyStrengthPct}%"
						></div>
					</div>
					<span class="meter-label">{ctx.dutyStrengthPct}% present</span>
				</div>

				{#if statusBreakdown.length > 0}
					<ul class="ledger-list">
						{#each statusBreakdown as info (info.name)}
							<li class="ledger-item">
								<span class="ledger-label">{info.name}</span>
								<span class="ledger-value" style="background: {info.color}; color: {info.textColor}">
									{info.count}
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="module-note">No unavailable personnel recorded today.</p>
				{/if}
			</div>
		</section>
	{:else if cardId === 'duty'}
		<section class="dashboard-module">
			<header class="module-header">
				<div class="module-heading">
					<span class="module-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
							<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
							<path d="M9 14l2 2 4-4" />
						</svg>
					</span>
					<div>
						<p class="module-kicker">Calendar</p>
						<h3>Today's duty assignments</h3>
					</div>
				</div>
				<a href="/org/{ctx.data.orgId}/calendar" class="module-action">Open calendar</a>
			</header>

			<div class="module-body">
				{#if ctx.dutyAssignments.length > 0}
					<div class="stack-list">
						{#each ctx.dutyAssignments as assignment (assignment.id)}
							<div class="stack-row">
								<div class="stack-row-main">
									<span class="inline-badge" style="background: {assignment.color}; color: white">
										{assignment.shortName || assignment.typeName}
									</span>
									<span class="stack-title">{assignment.typeName}</span>
								</div>
								<span class="stack-meta">{assignment.assigneeName || 'Unassigned'}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="module-empty">
						<p>No assignments are posted for today.</p>
						<a href="/org/{ctx.data.orgId}/calendar" class="btn btn-secondary btn-sm">Manage assignments</a>
					</div>
				{/if}
			</div>
		</section>
	{:else if cardId === 'training'}
		<section class="dashboard-module">
			<header class="module-header">
				<div class="module-heading">
					<span class="module-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
							<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
						</svg>
					</span>
					<div>
						<p class="module-kicker">Training</p>
						<h3>Training watch</h3>
					</div>
				</div>
				<a href="/org/{ctx.data.orgId}/training" class="module-action">Full report</a>
			</header>

			<div class="module-body">
				{#if ctx.trainingStats === null}
					<div class="module-empty">
						<p>No training types have been configured yet.</p>
						{#if ctx.data.permissions?.canEditTraining}
							<a href="/org/{ctx.data.orgId}/training" class="btn btn-secondary btn-sm">Set up training</a>
						{/if}
					</div>
				{:else}
					<div class="metric-grid metric-grid--four">
						<div class="metric-cell metric-cell--critical">
							<span class="metric-value">{ctx.trainingStats.expired}</span>
							<span class="metric-label">Expired</span>
						</div>
						<div class="metric-cell metric-cell--watch">
							<span class="metric-value">{ctx.trainingStats.warningOrange}</span>
							<span class="metric-label">Expiring Soon</span>
						</div>
						<div class="metric-cell metric-cell--amber">
							<span class="metric-value">{ctx.trainingStats.warningYellow}</span>
							<span class="metric-label">Due Soon</span>
						</div>
						<div class="metric-cell metric-cell--good">
							<span class="metric-value">{ctx.trainingStats.current}</span>
							<span class="metric-label">Current</span>
						</div>
					</div>

					{#if ctx.topTrainingIssues.length > 0}
						<div class="module-subsection">
							<p class="subsection-label">Needs attention</p>
							<div class="issue-list">
								{#each ctx.topTrainingIssues as issue (`${issue.personName}-${issue.typeName}`)}
									<div class="issue-row">
										<div class="issue-copy">
											<span class="issue-name">{issue.personName}</span>
											<span class="issue-type">{issue.typeName}</span>
										</div>
										<span
											class="issue-badge"
											class:issue-badge--critical={issue.status === 'expired'}
											class:issue-badge--watch={issue.status === 'warning-orange'}
										>
											{issue.label}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</section>
	{:else if cardId === 'upcoming'}
		<section class="dashboard-module">
			<header class="module-header">
				<div class="module-heading">
					<span class="module-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<circle cx="12" cy="12" r="10" />
							<polyline points="12 6 12 12 16 14" />
						</svg>
					</span>
					<div>
						<p class="module-kicker">Calendar</p>
						<h3>Upcoming changes</h3>
					</div>
				</div>
				<a href="/org/{ctx.data.orgId}/calendar" class="module-action">View calendar</a>
			</header>

			<div class="module-body">
				{#if ctx.upcomingByDate.size === 0}
					<div class="module-empty">
						<p>No status changes are scheduled in the next 7 days.</p>
						<a href="/org/{ctx.data.orgId}/calendar" class="btn btn-secondary btn-sm">Review schedule</a>
					</div>
				{:else}
					<div class="upcoming-list">
						{#each [...ctx.upcomingByDate.entries()] as [date, changes] (date)}
							<section class="upcoming-group">
								<h4>{ctx.formatShortDate(date)}</h4>
								<div class="upcoming-group-items">
									{#each changes as change (`${change.direction}-${change.personName}-${change.statusName}`)}
										<div class="upcoming-item">
											<span class="upcoming-person">{change.personName}</span>
											<span class="upcoming-detail">
												{change.direction === 'departing' ? 'Starts' : 'Returns'} • {change.statusName}
											</span>
										</div>
									{/each}
								</div>
							</section>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	{:else if cardId === 'ratings'}
		<section class="dashboard-module">
			<header class="module-header">
				<div class="module-heading">
					<span class="module-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M12 20h9" />
							<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
						</svg>
					</span>
					<div>
						<p class="module-kicker">Readiness</p>
						<h3>Rating scheme</h3>
					</div>
				</div>
				<a href="/org/{ctx.data.orgId}/personnel" class="module-action">Open personnel</a>
			</header>

			<div class="module-body">
				{#if ctx.ratingTotal === 0}
					<div class="module-empty">
						<p>No active rating entries are currently being tracked.</p>
						<a href="/org/{ctx.data.orgId}/personnel" class="btn btn-secondary btn-sm">Manage ratings</a>
					</div>
				{:else}
					<div class="metric-grid metric-grid--four">
						<div class="metric-cell" style="--metric-accent: {RATING_STATUS_COLORS.overdue}">
							<span class="metric-value">{ctx.ratingStats.overdue}</span>
							<span class="metric-label">Overdue</span>
						</div>
						<div class="metric-cell" style="--metric-accent: {RATING_STATUS_COLORS['due-30']}">
							<span class="metric-value">{ctx.ratingStats['due-30']}</span>
							<span class="metric-label">Due 30d</span>
						</div>
						<div class="metric-cell" style="--metric-accent: {RATING_STATUS_COLORS['due-60']}">
							<span class="metric-value">{ctx.ratingStats['due-60']}</span>
							<span class="metric-label">Due 60d</span>
						</div>
						<div class="metric-cell metric-cell--good" style="--metric-accent: {RATING_STATUS_COLORS.current}">
							<span class="metric-value">{ctx.ratingStats.current}</span>
							<span class="metric-label">Current</span>
						</div>
					</div>
				{/if}
			</div>
		</section>
	{:else if cardId === 'onboardings'}
		{#if ctx.data.permissions?.canViewPersonnel}
			<section class="dashboard-module dashboard-module--full">
				<header class="module-header">
					<div class="module-heading">
						<span class="module-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
								<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
								<line x1="9" y1="12" x2="15" y2="12" />
								<line x1="9" y1="16" x2="15" y2="16" />
							</svg>
						</span>
						<div>
							<p class="module-kicker">Onboarding</p>
							<h3>Active onboardings</h3>
						</div>
					</div>
					<div class="module-header-meta">
						{#if ctx.activeOnboardings.length > 0}
							<span class="header-count">{ctx.activeOnboardings.length}</span>
						{/if}
						<a href="/org/{ctx.data.orgId}/onboarding" class="module-action">View all</a>
					</div>
				</header>

				<div class="module-body">
					{#if ctx.activeOnboardings.length > 0}
						<div class="progress-list">
							{#each ctx.activeOnboardings as ob (ob.id)}
								<div class="progress-row">
									<div class="progress-copy">
										<span class="progress-name">{ob.personName}</span>
										<span class="progress-meta">{ob.completedSteps}/{ob.totalSteps} steps complete</span>
									</div>
									<div class="progress-track-wrap">
										<div class="progress-track" aria-hidden="true">
											<div class="progress-track-fill" style="width: {ob.pct}%"></div>
										</div>
										<span class="progress-pct">{ob.pct}%</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="module-empty">
							<p>No onboardings are active right now.</p>
							<a href="/org/{ctx.data.orgId}/onboarding" class="btn btn-secondary btn-sm">Open onboarding</a>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	{:else if cardId === 'groups'}
		{#if ctx.groupBreakdown.length > 0}
			<section class="dashboard-module dashboard-module--full">
				<header class="module-header">
					<div class="module-heading">
						<span class="module-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
								<circle cx="9" cy="7" r="4" />
								<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
								<path d="M16 3.13a4 4 0 0 1 0 7.75" />
							</svg>
						</span>
						<div>
							<p class="module-kicker">Groups</p>
							<h3>Per-group breakdown</h3>
						</div>
					</div>
				</header>

				<div class="module-table-wrap">
					<table class="group-table">
						<thead>
							<tr>
								<th class="col-group">Group</th>
								<th class="col-num">Total</th>
								<th class="col-num">Present</th>
								{#each statusTypesStore.items as st (st.id)}
									<th class="col-num col-status">{st.name}</th>
								{/each}
								<th class="col-num">Ready %</th>
							</tr>
						</thead>
						<tbody>
							{#each ctx.groupBreakdown as group (group.id)}
								<tr class:pinned={group.isPinned}>
									<td class="col-group">
										<div class="group-name">
											{#if group.isPinned}
												<svg class="pin-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
													<path
														d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6zm0 8c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2z"
													/>
												</svg>
											{/if}
											<span>{group.name}</span>
										</div>
									</td>
									<td class="col-num">{group.total}</td>
									<td class="col-num col-present">{group.available}</td>
									{#each statusTypesStore.items as st (st.id)}
										<td class="col-num">
											{#if (group.statusCounts.get(st.id) ?? 0) > 0}
												<span class="table-chip">{group.statusCounts.get(st.id)}</span>
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
			</section>
		{/if}
	{/if}
{/snippet}

<style>
	.dashboard-page {
		min-height: 100%;
		background: var(--surface-page);
	}

	.dashboard-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		max-width: 1520px;
		margin: 0 auto;
		padding: clamp(var(--sp-4), 2.5vw, var(--sp-8));
	}

	.section-kicker,
	.module-kicker,
	.module-action,
	.subsection-label,
	.meter-label,
	.metric-label,
	.briefing-metric dt,
	.briefing-metric span,
	.strength-meta,
	.strength-facts dt,
	.stack-meta,
	.progress-meta,
	.progress-pct,
	.header-count,
	.group-table th {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.dashboard-briefing,
	.dashboard-notice {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		padding: clamp(var(--sp-5), 2vw, var(--sp-6));
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.briefing-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-5);
	}

	.briefing-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		max-width: 48rem;
	}

	.section-kicker,
	.module-kicker,
	.subsection-label {
		margin: 0;
		color: var(--amber);
	}

	.briefing-copy h2,
	.module-heading h3,
	.notice-copy h3 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		line-height: 0.95;
		color: var(--text-primary);
	}

	.briefing-copy h2 {
		font-size: clamp(2.6rem, 2rem + 1.8vw, 4rem);
	}

	.briefing-copy p,
	.notice-copy p {
		margin: 0;
		font-size: var(--text-base);
		line-height: var(--line-height-copy);
		color: var(--text-secondary);
	}

	.briefing-date {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 84%, var(--surface-subtle) 16%);
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.date-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.briefing-metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-4);
		margin: 0;
	}

	.briefing-metric {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	.briefing-metric dt {
		color: var(--text-tertiary);
	}

	.briefing-metric dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 1.5rem + 0.7vw, 2.6rem);
		font-weight: var(--font-weight-display);
		line-height: 0.92;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.briefing-metric span {
		color: var(--text-tertiary);
	}

	.briefing-metric.attention dd,
	.briefing-metric.attention span {
		color: var(--amber-dark);
	}

	.dashboard-notice {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-5);
		background: color-mix(in srgb, var(--surface-panel) 82%, var(--amber-light) 18%);
	}

	.notice-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-width: 44rem;
	}

	.notice-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		flex-shrink: 0;
	}

	.dashboard-stack :global(.getting-started) {
		margin-bottom: 0;
	}

	.module-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sp-6);
	}

	.module-row--paired {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.dashboard-module {
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.module-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-5) var(--sp-6) var(--sp-4);
		border-bottom: var(--border-rule);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.module-heading {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		min-width: 0;
	}

	.module-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid rgba(var(--amber-rgb), 0.3);
		border-radius: var(--radius-md);
		color: var(--amber-dark);
		flex-shrink: 0;
	}

	.module-icon svg {
		width: 16px;
		height: 16px;
	}

	.module-heading h3 {
		font-size: clamp(1.25rem, 1.05rem + 0.5vw, 1.7rem);
	}

	.module-action {
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.module-action:hover {
		color: var(--amber-dark);
	}

	.module-header-meta {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-shrink: 0;
	}

	.header-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.75rem;
		height: 1.75rem;
		padding: 0 0.45rem;
		border: 1px solid rgba(var(--amber-rgb), 0.35);
		border-radius: var(--radius-md);
		color: var(--amber-dark);
	}

	.module-body,
	.module-table-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5) var(--sp-6);
		min-width: 0;
	}

	.module-table-wrap {
		padding-top: 0;
		overflow-x: auto;
	}

	.module-note {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.module-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-3);
	}

	.module-empty p {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.strength-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--sp-4);
		align-items: end;
	}

	.strength-figure {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.strength-number {
		font-family: var(--font-display);
		font-size: clamp(3rem, 2.3rem + 1.8vw, 4.6rem);
		font-weight: var(--font-weight-display);
		line-height: 0.88;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.strength-meta,
	.strength-facts dt,
	.meter-label,
	.stack-meta,
	.progress-meta,
	.progress-pct {
		color: var(--text-tertiary);
	}

	.strength-facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(6rem, 1fr));
		gap: var(--sp-3);
		margin: 0;
	}

	.strength-facts div {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: var(--sp-3);
		border-top: var(--border-thin);
	}

	.strength-facts dd {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.meter-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.meter-track,
	.progress-track {
		flex: 1;
		height: 8px;
		background: var(--surface-subtle);
		border-radius: 999px;
		overflow: hidden;
	}

	.meter-fill,
	.progress-track-fill {
		height: 100%;
		border-radius: 999px;
	}

	.meter-fill--good {
		background: var(--success);
	}

	.meter-fill--watch {
		background: var(--amber);
	}

	.meter-fill--risk {
		background: var(--danger);
	}

	.progress-track-fill {
		background: var(--amber);
	}

	.ledger-list,
	.stack-list,
	.issue-list,
	.progress-list,
	.upcoming-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.ledger-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.ledger-item,
	.stack-row,
	.issue-row,
	.progress-row,
	.upcoming-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding-bottom: var(--sp-3);
		border-bottom: var(--border-rule);
	}

	.ledger-item:last-child,
	.stack-row:last-child,
	.issue-row:last-child,
	.progress-row:last-child,
	.upcoming-item:last-child {
		padding-bottom: 0;
		border-bottom: none;
	}

	.ledger-label,
	.stack-title,
	.issue-name,
	.progress-name,
	.upcoming-person {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.ledger-value,
	.inline-badge,
	.table-chip,
	.issue-badge,
	.pct-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 1.5rem;
		padding: 0 0.55rem;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.stack-row-main,
	.issue-copy,
	.progress-copy {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-width: 0;
	}

	.issue-copy,
	.progress-copy {
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}

	.issue-type,
	.upcoming-detail {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.45;
	}

	.module-subsection {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding-top: var(--sp-4);
		border-top: var(--border-rule);
	}

	.metric-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.metric-cell {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 84%, var(--surface-subtle) 16%);
	}

	.metric-value {
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 1.5rem + 0.8vw, 2.6rem);
		font-weight: var(--font-weight-display);
		line-height: 0.92;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--metric-accent, var(--text-primary));
	}

	.metric-cell--critical {
		--metric-accent: var(--danger);
	}

	.metric-cell--watch {
		--metric-accent: var(--amber-dark);
	}

	.metric-cell--amber {
		--metric-accent: var(--amber);
	}

	.metric-cell--good {
		--metric-accent: var(--success);
	}

	.issue-badge {
		background: var(--surface-subtle);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.issue-badge--critical {
		background: color-mix(in srgb, var(--danger-bg) 74%, var(--surface-panel));
		color: var(--danger);
	}

	.issue-badge--watch {
		background: color-mix(in srgb, var(--amber-light) 74%, var(--surface-panel));
		color: var(--amber-dark);
	}

	.upcoming-list {
		gap: var(--sp-4);
	}

	.upcoming-group {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.upcoming-group h4 {
		margin: 0;
		padding-bottom: var(--sp-2);
		border-bottom: var(--border-rule);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber);
	}

	.upcoming-group-items {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.progress-track-wrap {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex: 1;
	}

	.progress-name {
		line-height: 1.4;
	}

	.group-table {
		width: 100%;
		border-collapse: collapse;
		min-width: 720px;
	}

	.group-table th {
		padding: var(--sp-3) var(--sp-2);
		text-align: left;
		color: var(--text-tertiary);
		border-bottom: var(--border-thin);
	}

	.group-table td {
		padding: var(--sp-3) var(--sp-2);
		border-bottom: var(--border-rule);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.group-table tbody tr:last-child td {
		border-bottom: none;
	}

	.group-table tr.pinned {
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.group-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: var(--font-weight-semibold);
	}

	.pin-icon {
		width: 12px;
		height: 12px;
		color: var(--amber-dark);
		flex-shrink: 0;
	}

	.col-group {
		min-width: 140px;
	}

	.col-num {
		text-align: center;
		width: 72px;
	}

	.col-present {
		color: var(--success);
		font-weight: var(--font-weight-semibold);
	}

	.col-zero {
		color: var(--text-tertiary);
	}

	.table-chip {
		background: var(--surface-subtle);
		color: var(--text-secondary);
		min-width: 1.75rem;
	}

	.pct-badge {
		background: var(--surface-subtle);
		color: var(--text-secondary);
		min-width: 2.5rem;
	}

	.pct-high {
		background: color-mix(in srgb, var(--success-bg) 76%, var(--surface-panel));
		color: var(--success);
	}

	.pct-mid {
		background: color-mix(in srgb, var(--amber-light) 76%, var(--surface-panel));
		color: var(--amber-dark);
	}

	.pct-low {
		background: color-mix(in srgb, var(--danger-bg) 76%, var(--surface-panel));
		color: var(--danger);
	}

	.dashboard-empty {
		padding: var(--sp-4) 0;
	}

	@media (max-width: 1100px) {
		.briefing-metrics,
		.metric-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 900px) {
		.module-row--paired {
			grid-template-columns: 1fr;
		}

		.dashboard-notice,
		.briefing-header,
		.module-header,
		.ledger-item,
		.stack-row,
		.issue-row,
		.progress-row,
		.upcoming-item {
			flex-direction: column;
			align-items: flex-start;
		}

		.briefing-date,
		.notice-actions,
		.module-header-meta,
		.progress-track-wrap {
			width: 100%;
		}

		.notice-actions,
		.module-header-meta {
			justify-content: flex-start;
		}
	}

	@media (max-width: 640px) {
		.dashboard-shell {
			padding: var(--sp-4);
		}

		.briefing-metrics,
		.metric-grid,
		.strength-grid,
		.strength-facts {
			grid-template-columns: 1fr;
		}

		.module-body,
		.module-header,
		.module-table-wrap,
		.dashboard-briefing,
		.dashboard-notice {
			padding-left: var(--sp-4);
			padding-right: var(--sp-4);
		}
	}
</style>
