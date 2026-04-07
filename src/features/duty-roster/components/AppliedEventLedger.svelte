<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { DutyEvent } from '../duty-roster.types';

	interface AppliedEventGroup {
		key: string;
		runId: string | null;
		templateName: string;
		eventCount: number;
		startDate: string;
		endDate: string;
		isLegacy: boolean;
		events: DutyEvent[];
	}

	interface Props {
		groups: AppliedEventGroup[];
		formatDisplayDate: (date: string) => string;
		formatGroupRange: (group: Pick<AppliedEventGroup, 'startDate' | 'endDate'>) => string;
		formatCoverageLabel: (event: DutyEvent) => string;
		formatFillSummary: (event: DutyEvent) => string;
		formatSlotAssignee: (id: string | null) => string;
		onOpenEvent: (event: DutyEvent) => void;
		onRequestDeleteEvent: (event: DutyEvent) => void;
		onRequestDeleteRun: (group: AppliedEventGroup) => void;
		selectedEventId: string | null;
	}

	let {
		groups,
		formatDisplayDate,
		formatGroupRange,
		formatCoverageLabel,
		formatFillSummary,
		formatSlotAssignee,
		onOpenEvent,
		onRequestDeleteEvent,
		onRequestDeleteRun,
		selectedEventId
	}: Props = $props();
</script>

<div class="applied-group-list">
	{#if groups.length === 0}
		<EmptyState
			message="No advanced duty events have been applied yet. Use the advanced lane to generate a series from an active template."
			variant="simple"
		/>
	{:else}
		{#each groups as group (group.key)}
			<details class="applied-group">
				<summary class="applied-group-summary">
					<div>
						<h4>{group.templateName}</h4>
						<p class="template-meta">
							{group.eventCount} applied event{group.eventCount === 1 ? '' : 's'} · {formatGroupRange(group)}
						</p>
					</div>
					<div class="summary-actions">
						{#if group.isLegacy}
							<span class="legacy-pill">Legacy</span>
						{/if}
						<button
							class="btn btn-danger btn-sm"
							type="button"
							aria-label={`Delete Run ${group.templateName}`}
							onclick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								onRequestDeleteRun(group);
							}}
						>
							Delete Run
						</button>
						<span class="applied-group-hint">Show run</span>
					</div>
				</summary>
				<div class="applied-ledger">
					{#each group.events as event (event.id)}
						<article class="applied-ledger-row" class:selected={event.id === selectedEventId}>
							<div class="applied-ledger-primary">
								<strong>{formatDisplayDate(event.eventDate)}</strong>
								<p class="template-meta">{formatCoverageLabel(event)} · {formatFillSummary(event)}</p>
							</div>
							<div class="applied-assignment-list">
								{#each event.slotInstances as slot (slot.id)}
									<span class="slot-chip">
										{slot.roleLabel} #{slot.slotIndex + 1}: {formatSlotAssignee(slot.assigneeId)}
									</span>
								{/each}
							</div>
							<div class="applied-ledger-actions">
								<button
									class="btn btn-danger btn-sm"
									type="button"
									aria-label={`Delete Event ${formatDisplayDate(event.eventDate)}`}
									onclick={() => onRequestDeleteEvent(event)}
								>
									Delete Day
								</button>
								<button
									class="btn btn-secondary btn-sm"
									type="button"
									aria-label={`Open Event ${formatDisplayDate(event.eventDate)}`}
									onclick={() => onOpenEvent(event)}
								>
									Open Event
								</button>
							</div>
						</article>
					{/each}
				</div>
			</details>
		{/each}
	{/if}
</div>

<style>
	.applied-group-list {
		display: grid;
		gap: var(--sp-3);
	}

	.applied-group {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		overflow: clip;
	}

	.applied-group-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-4);
		cursor: pointer;
		list-style: none;
	}

	.applied-group-summary::-webkit-details-marker {
		display: none;
	}

	h4 {
		margin: 0;
	}

	.template-meta {
		margin: var(--sp-1) 0 0;
		color: var(--text-secondary);
	}

	.applied-group-hint {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.summary-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.legacy-pill {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--amber-light) 70%, var(--surface-panel) 30%);
		color: var(--amber-dark);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.applied-ledger {
		display: grid;
		border-top: 1px solid var(--border-subtle);
	}

	.applied-ledger-row {
		display: grid;
		grid-template-columns: minmax(170px, 220px) minmax(0, 1fr) auto;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border-top: 1px solid var(--border-subtle);
		transition: background 0.1s;
	}

	.applied-ledger-row:first-child {
		border-top: none;
	}

	.applied-ledger-row.selected {
		background: color-mix(in srgb, var(--surface-subtle) 60%, var(--surface-panel) 40%);
	}

	.applied-ledger-primary {
		display: grid;
		align-content: start;
		gap: 4px;
	}

	.applied-assignment-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-content: start;
	}

	.applied-ledger-actions {
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
		gap: var(--sp-2);
	}

	.slot-chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--amber-light) 75%, var(--surface-panel) 25%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--amber-dark);
	}

	@media (max-width: 640px) {
		.applied-ledger-row {
			grid-template-columns: 1fr;
			gap: var(--sp-2);
		}

		.applied-ledger-actions {
			justify-content: flex-start;
		}
	}
</style>
