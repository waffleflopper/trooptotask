<script lang="ts">
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import UpcomingLossesWidget from '../UpcomingLossesWidget.svelte';

	interface Props {
		ctx: DashboardContext;
	}

	let { ctx }: Props = $props();

	const view = $derived(ctx.unitReadiness);
	const statusEntries = $derived(view.statusEntries);
</script>

<section class="tab-panel">
	<!-- Hero -->
	<div class="hero">
		<div class="section-kicker">Strength Today</div>
		<div class="hero-row">
			<div class="hero-numbers">
				<span class="hero-count">{ctx.availableCount}</span>
				<span class="hero-total">/ {ctx.totalPersonnel}</span>
			</div>
			<div class="hero-availability">
				<span class="hero-availability-pct" style="color: {view.availColor}">{view.availPct}%</span>
				<span class="hero-availability-label">Available</span>
			</div>
		</div>
		<div class="strength-bar-track">
			<div class="strength-bar-fill" style="width: {view.availPct}%; background: {view.availColor}"></div>
		</div>
		<div class="status-chips">
			<span class="status-entry"><strong>{ctx.availableCount}</strong> Present</span>
			{#each statusEntries as [, status] (status.name)}
				<span class="status-entry"><strong>{status.count}</strong> {status.name}</span>
			{/each}
		</div>
	</div>

	<!-- Supporting grid -->
	<div class="supporting-grid">
		<!-- Training Currency -->
		<div class="grid-cell">
			<div class="section-kicker">Training Currency</div>
			<div class="metric-large" style="color: {view.trainingColor}">{ctx.trainingCurrencyPct}%</div>
			<div class="metric-sub">of personnel current</div>
			{#if ctx.trainingStats}
				<div class="metric-detail">
					{#if ctx.trainingStats.expired > 0}
						<span style="color: var(--danger)">{ctx.trainingStats.expired} expired</span>
					{/if}
					{#if ctx.trainingStats.warningOrange > 0}
						<span style="color: var(--amber-dark)"> · {ctx.trainingStats.warningOrange} expiring</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Eval Pipeline -->
		<div class="grid-cell">
			<div class="section-kicker">Evaluations</div>
			<div class="eval-pair-row">
				<div class="eval-pair">
					<span class="eval-count" style="color: var(--danger)">{ctx.ratingStats.overdue}</span>
					<span class="eval-label">Overdue</span>
				</div>
				<div class="eval-pair">
					<span class="eval-count" style="color: var(--amber-dark)">{ctx.ratingStats['due-30']}</span>
					<span class="eval-label">Due in 30</span>
				</div>
			</div>
		</div>

		<!-- Group Readiness -->
		<div class="grid-cell">
			<div class="section-kicker">By Group</div>
			{#each ctx.groupBreakdown as group (group.id)}
				<div class="group-row">
					<span class="group-name">{group.name}</span>
					<div class="group-bar-track">
						<div
							class="group-bar-fill"
							style="width: {group.pct}%; background: {view.availabilityColor(group.pct)}"
						></div>
					</div>
					<span class="group-pct" style="color: {view.availabilityColor(group.pct)}">{group.pct}%</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Forward-looking row: short-range calendar changes beside medium-range loss tracking. -->
	{#if ctx.upcomingChanges.length > 0 || ctx.upcomingLosses.length > 0}
		<div class="forward-looking-grid">
			<div class="upcoming-section">
				<div class="upcoming-header">
					<div class="section-kicker">Upcoming Changes</div>
					{#if ctx.upcomingChanges.length > 0}
						<div class="view-toggle">
							<button
								class="toggle-btn"
								class:active={view.upcomingChanges.mode === 'date'}
								onclick={() => view.upcomingChanges.setMode('date')}>Date</button
							>
							<button
								class="toggle-btn"
								class:active={view.upcomingChanges.mode === 'group'}
								onclick={() => view.upcomingChanges.setMode('group')}>Group</button
							>
						</div>
					{/if}
				</div>
				{#if ctx.upcomingChanges.length === 0}
					<p class="empty-mono">No changes in the next 7 days.</p>
				{:else if view.upcomingChanges.mode === 'date'}
					{#each ctx.upcomingChanges as change (change.key)}
						<div class="upcoming-row">
							<span class="upcoming-name">{change.personName}</span>
							<span class="upcoming-meta">
								{ctx.formatShortDate(change.date)} — {change.direction === 'departing'
									? change.statusName
									: 'Returning'}
							</span>
						</div>
					{/each}
				{:else}
					{#each view.upcomingChanges.byGroup as [groupName, changes], i (groupName)}
						<div class="group-header" class:group-header--first={i === 0}>{groupName}</div>
						{#each changes as change (change.key)}
							<div class="upcoming-row">
								<span class="upcoming-name">{change.personName}</span>
								<span class="upcoming-meta">
									{ctx.formatShortDate(change.date)} — {change.direction === 'departing'
										? change.statusName
										: 'Returning'}
								</span>
							</div>
						{/each}
					{/each}
				{/if}
			</div>
			<div class="losses-section">
				<UpcomingLossesWidget losses={ctx.upcomingLosses} formatDate={(d) => ctx.formatShortDate(d)} />
			</div>
		</div>
	{/if}
</section>

<style>
	.tab-panel {
		padding: 0 var(--sp-4) var(--sp-12);
	}

	/* ── Shared section kicker ────────────────────────────── */
	.section-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		margin-bottom: var(--sp-3);
	}

	/* ── Hero ─────────────────────────────────────────────── */
	.hero {
		padding: var(--sp-8) 0 var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.hero-row {
		display: flex;
		align-items: baseline;
		gap: var(--sp-6);
	}

	.hero-numbers {
		display: flex;
		align-items: baseline;
		gap: var(--sp-3);
	}

	.hero-count {
		font-family: var(--font-display);
		font-size: var(--text-5xl);
		font-weight: var(--font-weight-display);
		line-height: var(--line-height-display);
		color: var(--ink);
	}

	.hero-total {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-regular);
		color: var(--ink-60);
	}

	.hero-availability {
		margin-left: auto;
		text-align: right;
	}

	.hero-availability-pct {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		display: block;
	}

	.hero-availability-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		display: block;
		margin-top: 2px;
	}

	.strength-bar-track {
		width: 100%;
		height: 3px;
		background: var(--ink-15);
		overflow: hidden;
	}

	.strength-bar-fill {
		height: 100%;
		transition: width 0.4s ease-out;
	}

	.status-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1);
	}

	.status-entry {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-secondary);
	}

	.status-entry strong {
		color: var(--ink);
		font-weight: var(--font-weight-semibold);
	}

	.status-entry + .status-entry::before {
		content: ' · ';
		color: var(--ink-35);
	}

	/* ── Supporting grid ──────────────────────────────────── */
	.supporting-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-6);
		padding: var(--sp-8) 0;
		border-top: 1px solid var(--ink-15);
	}

	.grid-cell {
		display: flex;
		flex-direction: column;
	}

	/* Training Currency */
	.metric-large {
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		margin-bottom: var(--sp-1);
	}

	.metric-sub {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-bottom: var(--sp-2);
	}

	.metric-detail {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
	}

	/* Eval Pipeline */
	.eval-pair-row {
		display: flex;
		gap: var(--sp-6);
		align-items: flex-start;
		margin-top: var(--sp-2);
	}

	.eval-pair {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.eval-count {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
	}

	.eval-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
	}

	/* Group Readiness */
	.group-row {
		display: grid;
		grid-template-columns: 72px 1fr 36px;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) 0;
	}

	.group-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.group-bar-track {
		height: 2px;
		background: var(--ink-15);
		overflow: hidden;
	}

	.group-bar-fill {
		height: 100%;
	}

	.group-pct {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-align: right;
	}

	/* ── Forward-looking row ──────────────────────────────── */
	.forward-looking-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-8);
		padding: var(--sp-6) 0;
		border-top: 1px solid var(--ink-15);
		align-items: start;
	}

	.upcoming-section,
	.losses-section {
		min-width: 0;
	}

	/* ── Upcoming Changes ─────────────────────────────────── */
	.upcoming-header {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.upcoming-header .section-kicker {
		margin-bottom: 0;
	}

	.upcoming-row {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: var(--sp-4);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.upcoming-row:first-of-type {
		border-top: none;
	}

	.upcoming-name {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.upcoming-meta {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		white-space: nowrap;
	}

	.empty-mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		padding: var(--sp-4) 0;
		margin: 0;
	}

	/* ── Grouping view toggle ─────────────────────────────── */
	.view-toggle {
		margin-left: auto;
		display: flex;
		background: var(--ink-06);
		border-radius: var(--radius-sm);
		padding: 2px;
		gap: 1px;
	}

	.toggle-btn {
		font-family: var(--font-mono);
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		background: transparent;
		border: none;
		padding: 2px 7px;
		border-radius: calc(var(--radius-sm) - 1px);
		cursor: pointer;
		line-height: 1.5;
		white-space: nowrap;
		transition:
			background 0.1s ease,
			color 0.1s ease;
	}

	.toggle-btn.active {
		background: var(--surface-panel);
		color: var(--text-primary);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
	}

	.toggle-btn:hover:not(.active) {
		color: var(--text-secondary);
	}

	/* ── Group section headers ────────────────────────────── */
	.group-header {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		padding: var(--sp-3) 0 var(--sp-1);
		border-top: 1px solid var(--ink-06);
	}

	.group-header--first {
		padding-top: 0;
		border-top: none;
	}

	/* ── Responsive ───────────────────────────────────────── */
	@media (max-width: 720px) {
		.supporting-grid {
			grid-template-columns: 1fr 1fr;
		}

		.forward-looking-grid {
			grid-template-columns: 1fr;
			gap: var(--sp-6);
		}
	}

	@media (max-width: 480px) {
		.supporting-grid,
		.forward-looking-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
