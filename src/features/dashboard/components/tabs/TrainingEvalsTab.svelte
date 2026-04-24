<script lang="ts">
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';

	interface Props {
		ctx: DashboardContext;
	}

	let { ctx }: Props = $props();

	const view = $derived(ctx.trainingEvals);
</script>

<section class="tab-panel">
	<!-- Status Summary (conditional) -->
	{#if view.hasTrainingIssues && ctx.trainingStats}
		<div class="training-summary">
			<div class="summary-cell">
				<div class="summary-kicker">Expired</div>
				<div class="summary-count" style="color: var(--danger)">{ctx.trainingStats.expired}</div>
				<div class="summary-sub">records</div>
			</div>
			<div class="summary-cell">
				<div class="summary-kicker">Expiring in 30</div>
				<div class="summary-count" style="color: var(--amber-dark)">{ctx.trainingStats.warningOrange}</div>
				<div class="summary-sub">records</div>
			</div>
			<div class="summary-cell">
				<div class="summary-kicker">Currency</div>
				<div class="summary-count" style="color: {view.trainingColor}">{ctx.trainingCurrencyPct}%</div>
				<div class="summary-sub">personnel current</div>
			</div>
		</div>
	{:else if ctx.trainingStats === null}
		<div class="training-summary training-summary--skeleton">
			<div class="summary-cell">
				<div class="skeleton" style="height: 12px; width: 70px; margin-bottom: 8px;"></div>
				<div class="skeleton" style="height: 40px; width: 56px;"></div>
			</div>
			<div class="summary-cell">
				<div class="skeleton" style="height: 12px; width: 90px; margin-bottom: 8px;"></div>
				<div class="skeleton" style="height: 40px; width: 56px;"></div>
			</div>
			<div class="summary-cell">
				<div class="skeleton" style="height: 12px; width: 60px; margin-bottom: 8px;"></div>
				<div class="skeleton" style="height: 40px; width: 56px;"></div>
			</div>
		</div>
	{/if}

	<!-- Two-column training split -->
	<div class="training-split">
		<!-- Group Delinquencies -->
		<div class="split-col">
			<div class="section-kicker">By Section</div>
			{#if view.delinquencies.length === 0}
				<p class="empty-mono">All sections current.</p>
			{:else}
				{#each view.delinquencies as g (g.groupName)}
					<div class="group-row">
						<span class="group-name">{g.groupName}</span>
						<div class="group-bar-track">
							<div
								class="group-bar-fill"
								style="width: {Math.max((g.count / view.maxGroupCount) * 100, 4)}%; background: var(--danger)"
							></div>
						</div>
						<span class="group-count" style="color: var(--danger)">~{g.count}</span>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Individual Issues -->
		<div class="split-col">
			<div class="section-kicker">Individuals</div>
			{#if view.groupedIndividuals.length === 0}
				<p class="empty-mono">No individual issues.</p>
			{:else}
				<div class="individual-list">
					{#each view.groupedIndividuals as person (person.personName)}
						<div class="individual-row">
							<span class="individual-name">{person.personName}</span>
							<span class="individual-task">{person.typeNames}</span>
							<span class="individual-status" style="color: {person.isExpired ? 'var(--danger)' : 'var(--amber-dark)'}"
								>{person.label}</span
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Evaluation Pipeline -->
	<div class="eval-section">
		<div class="eval-section-heading">Evaluation Pipeline</div>

		{#if view.evalsDueSoon.length === 0}
			<p class="empty-mono">No evaluations due within 90 days.</p>
		{:else}
			<div class="eval-list">
				{#each view.evalsDueSoon as entry (entry.id)}
					<div class="eval-row">
						<span class="eval-person">{entry.personName}</span>
						<span class="eval-type">{entry.evalType}</span>
						<span class="eval-date">{ctx.formatShortDate(entry.ratingPeriodEnd)}</span>
						<span
							class="eval-status"
							style="color: {entry.status === 'overdue'
								? 'var(--danger)'
								: entry.status === 'due-30'
									? 'var(--amber-dark)'
									: 'var(--text-tertiary)'}"
						>
							{entry.status === 'overdue' ? `Overdue ${Math.abs(entry.daysUntil)}d` : `Due ${entry.daysUntil}d`}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- ICTL Placeholder -->
	<div class="ictl-placeholder">
		<span class="ictl-kicker">ICTL Status</span>
		<span class="ictl-note">Individual critical task data — coming soon</span>
	</div>
</section>

<style>
	.tab-panel {
		padding: 0 var(--sp-4) var(--sp-12);
	}

	.section-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		margin-bottom: var(--sp-3);
	}

	/* ── Training Summary ─────────────────────────────────── */
	.training-summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0;
		padding: var(--sp-6) 0;
	}

	.summary-cell {
		padding: 0 var(--sp-4);
	}

	.summary-cell:first-child {
		padding-left: 0;
	}

	/* Structural column dividers between metric cells — 1px neutral, not a status accent */
	.summary-cell + .summary-cell {
		border-left: 1px solid var(--ink-15);
	}

	.summary-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	.summary-count {
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
	}

	.summary-sub {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-top: var(--sp-1);
	}

	/* skeleton shimmer */
	.skeleton {
		background: var(--ink-06);
		border-radius: var(--radius-sm);
		animation: shimmer 1.5s ease-in-out infinite;
	}

	@keyframes shimmer {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* ── Training Split ───────────────────────────────────── */
	.training-split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-8);
		padding: var(--sp-8) 0;
		border-top: 1px solid var(--ink-15);
	}

	.split-col {
		display: flex;
		flex-direction: column;
	}

	/* Group rows */
	.group-row {
		display: grid;
		grid-template-columns: 72px 1fr 32px;
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

	.group-count {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-align: right;
		font-weight: var(--font-weight-semibold);
	}

	/* Individual issues list */
	.individual-list {
		max-height: 320px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--ink-15) transparent;
	}

	.individual-row {
		display: grid;
		grid-template-columns: 120px 1fr auto;
		align-items: baseline;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.individual-row:first-child {
		border-top: none;
	}

	.individual-name {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.individual-task {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.individual-status {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		white-space: nowrap;
	}

	/* ── Eval Pipeline ────────────────────────────────────── */
	.eval-section {
		padding: var(--sp-8) 0;
		border-top: 1px solid var(--ink-15);
	}

	.eval-section-heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-display);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--ink);
		margin-bottom: var(--sp-5);
	}

	.eval-list {
		display: flex;
		flex-direction: column;
	}

	.eval-row {
		display: grid;
		grid-template-columns: 130px 1fr auto auto;
		align-items: baseline;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.eval-row:first-child {
		border-top: none;
	}

	.eval-person {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.eval-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-secondary);
	}

	.eval-date {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		white-space: nowrap;
	}

	.eval-status {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		white-space: nowrap;
		font-weight: var(--font-weight-semibold);
	}

	/* ── ICTL Placeholder ─────────────────────────────────── */
	.ictl-placeholder {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-4) 0;
		border-top: 1px solid var(--border-rule);
		opacity: 0.5;
	}

	.ictl-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.ictl-note {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-tertiary);
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

	/* ── Responsive ───────────────────────────────────────── */
	@media (max-width: 720px) {
		.training-summary {
			grid-template-columns: 1fr 1fr 1fr;
		}

		.training-split {
			grid-template-columns: 1fr;
			gap: var(--sp-6);
		}

		.eval-row {
			grid-template-columns: 1fr auto;
		}

		.eval-type,
		.eval-date {
			display: none;
		}
	}

	@media (max-width: 480px) {
		.training-summary {
			grid-template-columns: repeat(3, 1fr);
		}

		.summary-cell {
			padding: 0 var(--sp-2);
		}
	}
</style>
