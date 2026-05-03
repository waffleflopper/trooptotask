<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type {
		AdvancedDutyRevisionDraftRecord,
		AdvancedDutyRevisionHistoryEntry,
		AdvancedDutyRevisionSlotChangeRecord,
		DutyEvent
	} from '../duty-roster.types';

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
		onViewRunDa6: (group: AppliedEventGroup) => void;
		canViewRunDa6: (group: AppliedEventGroup) => boolean;
		onRequestDeleteEvent: (event: DutyEvent) => void;
		onRequestDeleteRun: (group: AppliedEventGroup) => void;
		getRevisionHistory: (runId: string | null) => AdvancedDutyRevisionHistoryEntry[];
		getRevisionDraft: (runId: string | null) => AdvancedDutyRevisionDraftRecord | null;
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
		onViewRunDa6,
		canViewRunDa6,
		onRequestDeleteEvent,
		onRequestDeleteRun,
		getRevisionHistory,
		getRevisionDraft,
		selectedEventId
	}: Props = $props();

	function formatActor(actorUserId: string | null): string {
		return actorUserId ? `Actor ${actorUserId}` : 'Actor unavailable';
	}

	function formatRevisionDate(timestamp: string): string {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(timestamp));
	}

	function snapshotName(snapshot: Record<string, unknown> | null, fallbackId: string | null): string {
		if (!snapshot) return fallbackId ?? 'Open slot';
		const parts = [snapshot.rank, snapshot.firstName, snapshot.lastName]
			.map((value) => (typeof value === 'string' ? value.trim() : ''))
			.filter(Boolean);
		return parts.length > 0 ? parts.join(' ') : (fallbackId ?? 'Open slot');
	}

	function formatSlotChange(change: AdvancedDutyRevisionSlotChangeRecord): string {
		const previous = snapshotName(change.previousPersonnelSnapshot, change.previousPersonnelId);
		const next = snapshotName(change.newPersonnelSnapshot, change.newPersonnelId);
		return `${change.roleLabel} #${change.slotIndex + 1}: ${previous} to ${next}`;
	}
</script>

<div class="applied-group-list">
	{#if groups.length === 0}
		<EmptyState
			message="No advanced duty events have been applied yet. Use the advanced lane to generate a series from an active template."
			variant="simple"
		/>
	{:else}
		{#each groups as group (group.key)}
			{@const revisionDraft = getRevisionDraft(group.runId)}
			<details class="applied-group">
				<summary class="applied-group-summary">
					<div>
						<h4>{group.templateName}</h4>
						<p class="template-meta">
							{group.eventCount} applied event{group.eventCount === 1 ? '' : 's'} · {formatGroupRange(group)}
						</p>
						{#if revisionDraft}
							<p class="draft-meta">
								Revision draft v{revisionDraft.draftVersion} pending · {revisionDraft.slotChanges.length} staged change{revisionDraft
									.slotChanges.length === 1
									? ''
									: 's'}
							</p>
						{/if}
					</div>
					<div class="summary-actions">
						{#if revisionDraft}
							<span class="draft-pill">Draft pending</span>
						{/if}
						{#if group.isLegacy}
							<span class="legacy-pill">Legacy</span>
						{/if}
						{#if group.runId}
							<button
								class="btn btn-secondary btn-sm"
								type="button"
								aria-label={`View DA6 ${group.templateName}`}
								disabled={!canViewRunDa6(group)}
								title={canViewRunDa6(group) ? undefined : 'DA6 audit data is not available for this applied run.'}
								onclick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									if (!canViewRunDa6(group)) return;
									onViewRunDa6(group);
								}}
							>
								View DA6
							</button>
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
				{#each [getRevisionHistory(group.runId)] as revisions (revisions)}
					<section class="revision-history" aria-label={`${group.templateName} revision history`}>
						<div class="revision-history__header">
							<div>
								<p class="revision-kicker">Revision history</p>
								<h5>Run change record</h5>
							</div>
							<span>{revisions.length} manual revision{revisions.length === 1 ? '' : 's'}</span>
						</div>
						<ol class="revision-timeline">
							<li>
								<div class="revision-marker" aria-hidden="true"></div>
								<div>
									<p class="revision-label">Generated original</p>
									<p class="revision-copy">Initial assignments came from the approved Advanced Duty run proposal.</p>
								</div>
							</li>
							<li>
								<div class="revision-marker revision-marker--current" aria-hidden="true"></div>
								<div>
									<p class="revision-label">Current applied state</p>
									<p class="revision-copy">
										Operational records now show {group.eventCount} event{group.eventCount === 1 ? '' : 's'} from {formatGroupRange(
											group
										)}.
									</p>
								</div>
							</li>
							{#if revisions.length === 0}
								<li>
									<div class="revision-marker revision-marker--quiet" aria-hidden="true"></div>
									<div>
										<p class="revision-label">No manual revisions recorded</p>
										<p class="revision-copy">This applied run has not been changed through a revision draft.</p>
									</div>
								</li>
							{:else}
								{#each revisions as revision (revision.id)}
									<li class="revision-entry">
										<div class="revision-marker revision-marker--manual" aria-hidden="true"></div>
										<div>
											<div class="revision-entry__topline">
												<p class="revision-label">Manual revision</p>
												<span>{formatRevisionDate(revision.appliedAt)} · {formatActor(revision.actorUserId)}</span>
											</div>
											<p class="revision-reason">{revision.reason}</p>
											<ul
												class="revision-slot-list"
												aria-label={`Changed slots for revision ${formatRevisionDate(revision.appliedAt)}`}
											>
												{#each revision.changes as change (change.id)}
													<li>
														<span>{formatDisplayDate(change.eventDate)}</span>
														<strong>{formatSlotChange(change)}</strong>
													</li>
												{/each}
											</ul>
										</div>
									</li>
								{/each}
							{/if}
						</ol>
					</section>
				{/each}
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

	.draft-meta {
		margin: var(--sp-2) 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--amber-dark);
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

	.legacy-pill,
	.draft-pill {
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

	.draft-pill {
		border: 1px solid color-mix(in srgb, var(--amber) 32%, var(--border-default) 68%);
		background: color-mix(in srgb, var(--amber-light) 52%, var(--surface-panel) 48%);
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

	.revision-history {
		border-top: 1px solid var(--border-subtle);
		background: color-mix(in srgb, var(--surface-subtle) 45%, var(--surface-panel) 55%);
		padding: var(--sp-4);
	}

	.revision-history__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.revision-history__header h5,
	.revision-label,
	.revision-reason,
	.revision-copy {
		margin: 0;
	}

	.revision-history__header h5 {
		font-size: var(--text-base);
	}

	.revision-history__header span,
	.revision-kicker,
	.revision-entry__topline span,
	.revision-slot-list span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.revision-kicker {
		margin: 0 0 2px;
	}

	.revision-timeline {
		display: grid;
		gap: var(--sp-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.revision-timeline > li {
		display: grid;
		grid-template-columns: 12px minmax(0, 1fr);
		gap: var(--sp-3);
	}

	.revision-marker {
		width: 10px;
		height: 10px;
		margin-top: 5px;
		border: 1px solid var(--border-default);
		border-radius: 999px;
		background: var(--surface-panel);
	}

	.revision-marker--current {
		background: var(--success-bg);
		border-color: var(--success);
	}

	.revision-marker--manual {
		background: var(--amber-light);
		border-color: var(--amber-dark);
	}

	.revision-marker--quiet {
		background: var(--surface-subtle);
	}

	.revision-label {
		font-weight: var(--font-weight-bold);
		color: var(--text-primary);
	}

	.revision-copy {
		margin-top: 2px;
		color: var(--text-secondary);
	}

	.revision-entry__topline {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.revision-reason {
		margin-top: 2px;
		color: var(--text-primary);
	}

	.revision-slot-list {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-2) 0 0;
		padding: 0;
		list-style: none;
	}

	.revision-slot-list li {
		display: grid;
		gap: 2px;
		padding: var(--sp-2);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.revision-slot-list strong {
		font-size: var(--text-sm);
		color: var(--text-primary);
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
