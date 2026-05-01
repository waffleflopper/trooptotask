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

	{#if view.ictl.state === 'empty'}
		<section class="ictl-summary" aria-label="Critical Tasks summary">
			<div class="ictl-heading">
				<div>
					<div class="ictl-kicker">Critical Tasks</div>
					<h3>No active tasks configured.</h3>
				</div>
				<a class="ictl-link" href={view.ictl.reportHref}>Open reports</a>
			</div>
			<p class="ictl-empty">Add active ICTL tasks before readiness can be summarized here.</p>
		</section>
	{:else if view.ictl.state === 'ready'}
		<section class="ictl-summary" aria-label="Critical Tasks summary">
			<div class="ictl-heading">
				<div>
					<div class="ictl-kicker">Critical Tasks</div>
					<h3>ICTL Readiness</h3>
				</div>
				<a class="ictl-link" href={view.ictl.reportHref}>Open reports</a>
			</div>

			<div class="ictl-grid">
				<div class="ictl-readiness">
					<span class="ictl-value" style="color: {view.ictl.readinessColor}">{view.ictl.readinessLabel}</span>
					<span class="ictl-sub">{view.ictl.readyCount} of {view.ictl.applicableCount} applicable records ready</span>
					<span class="ictl-delta">{view.ictl.deltaLabel}</span>
				</div>

				<div class="ictl-alerts">
					<span>{view.ictl.primaryConcern}</span>
					<span>{view.ictl.expiringSoonLabel}</span>
					<span>{view.ictl.tasksBelowThresholdLabel}</span>
					<span>{view.ictl.projectedReadinessLabel}</span>
				</div>
			</div>

			{#if view.ictl.mosReadiness.length > 0}
				<div class="ictl-mos-list" aria-label="Critical Tasks MOS readiness">
					{#each view.ictl.mosReadiness as row (row.mos)}
						<div class="ictl-mos-row">
							<span class="ictl-mos-label">{row.mos}</span>
							<div class="ictl-mos-track">
								<div class="ictl-mos-fill" style="width: {Math.max(row.readinessPercent, 4)}%"></div>
							</div>
							<span class="ictl-mos-value">{row.readinessPercent}%</span>
							<span class="ictl-mos-count">{row.personnelCount} pax</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="ictl-action-lists">
				<div>
					<div class="ictl-list-title">Below Threshold</div>
					{#if view.ictl.tasksBelowThreshold.length === 0}
						<p class="empty-mono">No tasks below threshold.</p>
					{:else}
						{#each view.ictl.tasksBelowThreshold as task (task.taskId)}
							<div class="ictl-list-row">
								<span>{task.taskCode}</span>
								<span>{task.percentComplete}%</span>
								<span>{task.soldierGapCount} gap</span>
							</div>
						{/each}
					{/if}
				</div>
				<div>
					<div class="ictl-list-title">At Risk</div>
					{#if view.ictl.atRiskSoldiers.length === 0}
						<p class="empty-mono">No at-risk Soldiers.</p>
					{:else}
						{#each view.ictl.atRiskSoldiers as soldier (soldier.personnelId)}
							<div class="ictl-list-row">
								<span>{soldier.soldierName}</span>
								<span>{soldier.readinessPercent}%</span>
								<span>{soldier.tasksExpiringSoonCount} exp</span>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</section>
	{/if}
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

	/* ── ICTL Summary ─────────────────────────────────────── */
	.ictl-summary {
		padding: var(--sp-8) 0 0;
		border-top: 1px solid var(--border-rule);
	}

	.ictl-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
	}

	.ictl-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
		margin-bottom: var(--sp-5);
	}

	.ictl-heading h3 {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-display);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--ink);
		margin: var(--sp-1) 0 0;
	}

	.ictl-link {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-primary);
		text-decoration: none;
		border-bottom: 1px solid var(--ink-30);
		white-space: nowrap;
	}

	.ictl-grid {
		display: grid;
		grid-template-columns: minmax(180px, 0.8fr) 1.2fr;
		gap: var(--sp-6);
		margin-bottom: var(--sp-6);
	}

	.ictl-readiness,
	.ictl-alerts {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.ictl-value {
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		text-transform: uppercase;
	}

	.ictl-sub,
	.ictl-empty {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
	}

	.ictl-delta,
	.ictl-alerts span,
	.ictl-list-title,
	.ictl-list-row,
	.ictl-mos-label,
	.ictl-mos-value,
	.ictl-mos-count {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
	}

	.ictl-delta {
		color: var(--text-tertiary);
	}

	.ictl-alerts span {
		color: var(--text-secondary);
	}

	.ictl-mos-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-bottom: var(--sp-6);
	}

	.ictl-mos-row {
		display: grid;
		grid-template-columns: 56px minmax(72px, 1fr) 48px 58px;
		align-items: center;
		gap: var(--sp-2);
	}

	.ictl-mos-label,
	.ictl-mos-value {
		color: var(--text-primary);
		font-weight: var(--font-weight-semibold);
	}

	.ictl-mos-count {
		color: var(--text-tertiary);
		text-align: right;
	}

	.ictl-mos-track {
		height: 3px;
		background: var(--ink-15);
		overflow: hidden;
	}

	.ictl-mos-fill {
		height: 100%;
		background: var(--ink);
	}

	.ictl-action-lists {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-8);
	}

	.ictl-list-title {
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	.ictl-list-row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
		color: var(--text-secondary);
	}

	.ictl-list-row span:first-child {
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
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

		.ictl-grid,
		.ictl-action-lists {
			grid-template-columns: 1fr;
			gap: var(--sp-5);
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
