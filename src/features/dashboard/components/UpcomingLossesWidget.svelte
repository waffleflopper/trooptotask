<script lang="ts">
	import type { UpcomingLossRecord } from '../utils/evaluateUpcomingLosses';

	interface Props {
		losses: UpcomingLossRecord[];
		formatDate: (dateStr: string) => string;
	}

	let { losses, formatDate }: Props = $props();

	/** Urgency tier for countdown coloring */
	function urgencyTier(days: number): 'critical' | 'warning' | 'routine' {
		if (days <= 30) return 'critical';
		if (days <= 90) return 'warning';
		return 'routine';
	}

	function formatDaysRemaining(days: number): string {
		if (days === 0) return 'Today';
		if (days === 1) return '1 day';
		return `${days} days`;
	}
</script>

<!--
  Upcoming Losses widget — dedicated operational surface for personnel approaching
  ETS or PCS / DEROS within the configured warning window.

  Intentionally separated from "Upcoming Changes" per the PRD: this tracks
  medium-range permanent losses, not near-term calendar-driven availability shifts.
-->
<div class="widget">
	<div class="widget-header">
		<span class="widget-kicker">Upcoming Losses</span>
		{#if losses.length > 0}
			<span class="widget-count">{losses.length}</span>
		{/if}
	</div>

	{#if losses.length === 0}
		<p class="empty-state">No personnel approaching ETS or PCS / DEROS window.</p>
	{:else}
		<div class="loss-list" role="list">
			{#each losses as entry (entry.id)}
				<div class="loss-row" role="listitem">
					<!-- Person identity -->
					<div class="person-col">
						<span class="person-rank">{entry.rank}</span>
						<span class="person-name">{entry.personName.replace(/^[A-Z0-9]+ /, '')}</span>
					</div>

					<!-- Trigger type label -->
					<span class="trigger-chip" class:trigger-chip--ets={entry.triggerType === 'ETS'}>
						{entry.triggerType}
					</span>

					<!-- Target date -->
					<span class="target-date">{formatDate(entry.targetDate)}</span>

					<!-- Countdown -->
					<span
						class="countdown"
						class:countdown--critical={urgencyTier(entry.daysRemaining) === 'critical'}
						class:countdown--warning={urgencyTier(entry.daysRemaining) === 'warning'}
						title="{entry.daysRemaining} calendar days remaining"
					>
						{formatDaysRemaining(entry.daysRemaining)}
					</span>

					<!-- Award-due signal (V1: informational only) -->
					{#if entry.awardDueSoon}
						<span class="award-flag" title="Award preparation recommended before departure">AWD</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* ── Widget shell ──────────────────────────────────────────── */
	.widget {
		display: flex;
		flex-direction: column;
	}

	.widget-header {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.widget-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
	}

	/* Count badge — amber-tinted, matches dashboard section-count pattern */
	.widget-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 18px;
		padding: 0 5px;
		border: 1px solid color-mix(in srgb, var(--border-default) 70%, var(--amber) 30%);
		background: color-mix(in srgb, var(--amber-light) 72%, var(--surface-panel) 28%);
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		border-radius: var(--radius-sm);
		line-height: 1;
	}

	/* ── Empty state ───────────────────────────────────────────── */
	.empty-state {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		padding: var(--sp-4) 0;
		margin: 0;
	}

	/* ── Loss list ─────────────────────────────────────────────── */
	.loss-list {
		display: flex;
		flex-direction: column;
	}

	/*
	  Grid columns:
	    1fr         → person name (rank + last name)
	    auto        → trigger chip (ETS / PCS / DEROS)
	    auto        → target date
	    auto        → countdown
	    auto        → award flag (optional, collapses when absent)
	*/
	.loss-row {
		display: grid;
		grid-template-columns: 1fr auto auto auto auto;
		align-items: baseline;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.loss-row:first-child {
		border-top: none;
	}

	/* ── Person identity ───────────────────────────────────────── */
	.person-col {
		display: flex;
		align-items: baseline;
		gap: var(--sp-1);
		min-width: 0;
	}

	.person-rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.person-name {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Trigger type chip ─────────────────────────────────────── */
	.trigger-chip {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		flex-shrink: 0;
		/* PCS / DEROS default: neutral tint */
		background: var(--ink-06);
		color: var(--text-secondary);
	}

	/* ETS: amber-tinted to flag impending separation */
	.trigger-chip--ets {
		background: color-mix(in srgb, var(--amber-light) 80%, var(--surface-panel) 20%);
		color: var(--amber-dark);
	}

	/* ── Target date ───────────────────────────────────────────── */
	.target-date {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* ── Countdown ─────────────────────────────────────────────── */
	.countdown {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		white-space: nowrap;
		flex-shrink: 0;
		/* Routine (>90 days): muted */
		color: var(--text-tertiary);
	}

	/* Warning tier (31–90 days): amber to signal active attention needed */
	.countdown--warning {
		color: var(--amber-dark);
	}

	/* Critical tier (≤30 days): danger to flag imminent departure */
	.countdown--critical {
		color: var(--danger);
	}

	/* ── Award flag ────────────────────────────────────────────── */
	/*
	  V1 informational signal: surfaces "award preparation due."
	  Deliberately subtle — this is a prompt to act, not an alarm.
	  Uses a hairline outline style so it reads as metadata, not alert.
	*/
	.award-flag {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 1px 4px;
		border: 1px solid color-mix(in srgb, var(--border-default) 60%, var(--amber) 40%);
		color: var(--amber-dark);
		border-radius: var(--radius-sm);
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
