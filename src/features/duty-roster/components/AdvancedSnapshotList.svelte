<script lang="ts">
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import type { AdvancedDutyRunSnapshotRecord } from '../duty-roster.types';

	interface Props {
		snapshots: AdvancedDutyRunSnapshotRecord[];
		onResumeSnapshot: (snapshot: AdvancedDutyRunSnapshotRecord) => void;
		onDeleteSnapshot: (snapshot: AdvancedDutyRunSnapshotRecord) => Promise<boolean>;
	}

	let { snapshots, onResumeSnapshot, onDeleteSnapshot }: Props = $props();
	let selectedSnapshotId = $state<string | null>(null);
	let pendingDeleteSnapshot = $state<AdvancedDutyRunSnapshotRecord | null>(null);
	const selectedSnapshot = $derived(
		snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0] ?? null
	);

	$effect(() => {
		if (selectedSnapshotId && snapshots.some((snapshot) => snapshot.id === selectedSnapshotId)) return;
		selectedSnapshotId = snapshots[0]?.id ?? null;
	});

	function formatDate(value: string): string {
		return value || 'Not set';
	}

	function formatTimestamp(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function confirmDeleteSnapshot() {
		if (!pendingDeleteSnapshot) return;
		const snapshotId = pendingDeleteSnapshot.id;
		if (await onDeleteSnapshot(pendingDeleteSnapshot)) {
			if (selectedSnapshotId === snapshotId) {
				selectedSnapshotId = null;
			}
			pendingDeleteSnapshot = null;
		}
	}
</script>

<section class="snapshot-workspace" aria-label="Draft advanced duty snapshots">
	<div class="snapshot-header">
		<div>
			<p class="eyebrow">Draft snapshots</p>
			<h2>Resume an advanced duty run</h2>
		</div>
		<p>{snapshots.length} draft snapshot{snapshots.length === 1 ? '' : 's'}</p>
	</div>

	{#if snapshots.length === 0}
		<div class="empty-state">
			<h3>No draft snapshots</h3>
			<p>Preview an advanced run to create a resumable draft.</p>
		</div>
	{:else}
		<div class="snapshot-grid">
			<div class="snapshot-list" role="list" aria-label="Available draft snapshots">
				{#each snapshots as snapshot (snapshot.id)}
					<article class:selected={snapshot.id === selectedSnapshot?.id} class="snapshot-row" role="listitem">
						<div>
							<h3>{snapshot.templateName}</h3>
							<p>
								{formatDate(snapshot.startDate)} to {formatDate(snapshot.endDate)} · {snapshot.eventCount} event{snapshot.eventCount ===
								1
									? ''
									: 's'}
							</p>
						</div>
						<div class="snapshot-row__actions">
							<button class="btn btn-secondary btn-sm" type="button" onclick={() => (selectedSnapshotId = snapshot.id)}>
								View
							</button>
							<button class="btn btn-primary btn-sm" type="button" onclick={() => onResumeSnapshot(snapshot)}>
								Resume
							</button>
							<button
								class="btn btn-danger btn-sm"
								type="button"
								aria-label={`Delete snapshot for ${snapshot.templateName}`}
								onclick={() => (pendingDeleteSnapshot = snapshot)}
							>
								Delete
							</button>
						</div>
					</article>
				{/each}
			</div>

			{#if selectedSnapshot}
				<aside class="snapshot-detail" aria-label="Snapshot details">
					<p class="eyebrow">Snapshot detail</p>
					<h3>{selectedSnapshot.templateName}</h3>
					<dl>
						<div>
							<dt>Run dates</dt>
							<dd>{formatDate(selectedSnapshot.startDate)} to {formatDate(selectedSnapshot.endDate)}</dd>
						</div>
						<div>
							<dt>Pattern</dt>
							<dd>{selectedSnapshot.pattern}</dd>
						</div>
						<div>
							<dt>Events</dt>
							<dd>{selectedSnapshot.eventDates.join(', ')}</dd>
						</div>
						<div>
							<dt>Candidate pool</dt>
							<dd>{selectedSnapshot.candidatePersonnelIds.length || 'Full eligible pool'}</dd>
						</div>
						<div>
							<dt>Expires</dt>
							<dd>{formatTimestamp(selectedSnapshot.expiresAt)}</dd>
						</div>
					</dl>
					<div class="snapshot-detail__actions">
						<button class="btn btn-primary" type="button" onclick={() => onResumeSnapshot(selectedSnapshot)}>
							Resume Snapshot
						</button>
						<button class="btn btn-danger" type="button" onclick={() => (pendingDeleteSnapshot = selectedSnapshot)}>
							Delete Snapshot
						</button>
					</div>
				</aside>
			{/if}
		</div>
	{/if}
</section>

{#if pendingDeleteSnapshot}
	<ConfirmDialog
		title="Delete Draft Snapshot?"
		message={`Delete the ${pendingDeleteSnapshot.templateName} draft snapshot for ${formatDate(pendingDeleteSnapshot.startDate)} to ${formatDate(pendingDeleteSnapshot.endDate)}? This removes the saved preview, but does not touch applied duty history.`}
		confirmLabel="Delete Snapshot"
		cancelLabel="Keep Snapshot"
		variant="danger"
		onConfirm={confirmDeleteSnapshot}
		onCancel={() => (pendingDeleteSnapshot = null)}
	/>
{/if}

<style>
	.snapshot-workspace {
		display: grid;
		gap: var(--sp-4);
	}
	.snapshot-header,
	.snapshot-row,
	.snapshot-row__actions {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
	}
	.snapshot-header,
	.snapshot-row {
		justify-content: space-between;
	}
	.snapshot-header {
		padding-bottom: var(--sp-3);
		border-bottom: 1px solid var(--border-subtle);
	}
	.snapshot-header h2,
	.snapshot-row h3,
	.snapshot-detail h3,
	.empty-state h3 {
		margin: 0;
	}
	.snapshot-header p,
	.snapshot-row p,
	.empty-state p {
		margin: var(--sp-1) 0 0;
		color: var(--text-secondary);
	}
	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.snapshot-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 0.4fr);
		gap: var(--sp-4);
		align-items: start;
	}
	.snapshot-list {
		display: grid;
		gap: var(--sp-2);
	}
	.snapshot-row,
	.snapshot-detail,
	.empty-state {
		padding: var(--sp-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}
	.snapshot-row.selected {
		border-color: var(--amber-light);
		background: var(--surface-subtle);
	}
	.snapshot-row__actions {
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.snapshot-detail__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.snapshot-detail {
		position: sticky;
		top: var(--sp-4);
		display: grid;
		gap: var(--sp-3);
	}
	.snapshot-detail dl {
		display: grid;
		gap: var(--sp-2);
		margin: 0;
	}
	.snapshot-detail dl div {
		display: grid;
		grid-template-columns: minmax(96px, 0.36fr) minmax(0, 1fr);
		gap: var(--sp-2);
		padding-bottom: var(--sp-2);
		border-bottom: 1px solid var(--border-subtle);
	}
	.snapshot-detail dt {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.snapshot-detail dd {
		margin: 0;
		color: var(--text-secondary);
	}
	@media (max-width: 860px) {
		.snapshot-grid,
		.snapshot-row,
		.snapshot-detail dl div {
			grid-template-columns: 1fr;
		}
		.snapshot-row {
			display: grid;
		}
		.snapshot-detail {
			position: static;
		}
		.snapshot-row__actions,
		.snapshot-row__actions :global(.btn),
		.snapshot-detail__actions,
		.snapshot-detail :global(.btn) {
			width: 100%;
		}
	}
</style>
