<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { RatingSchemeEntry, RatingDueStatus } from '../rating-scheme.types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS, WORKFLOW_STATUS_COLORS } from '../rating-scheme.types';
	import { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from '$features/rating-scheme/utils/ratingScheme';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: Personnel[];
		onEdit: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, onEdit }: Props = $props();

	function getPersonName(id: string | null, name: string | null): string {
		if (id) {
			const p = personnel.find((p) => p.id === id);
			return p ? `${p.rank} ${p.lastName}` : 'Unknown';
		}
		return name ?? '—';
	}

	function getRatedPerson(id: string): Personnel | undefined {
		return personnel.find((p) => p.id === id);
	}

	function formatDueStatus(entry: RatingSchemeEntry): { label: string; color: string } {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
		const days = getDaysUntilDue(entry.ratingPeriodEnd);
		const color = RATING_STATUS_COLORS[status];

		if (status === 'completed') return { label: 'Completed', color };
		if (status === 'overdue') return { label: `Overdue (${Math.abs(days)}d)`, color };
		if (status === 'due-30') return { label: `${days}d`, color };
		if (status === 'due-60') return { label: `${days}d`, color };
		return { label: 'Current', color };
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });
	}

	function getWorkflowLabel(status: string): string {
		return WORKFLOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
	}
</script>

{#if entries.length === 0}
	<EmptyState message="No rating scheme entries yet. Click 'Add Entry' to get started." />
{:else}
	<div class="table-wrapper">
		<table class="rating-table">
			<thead>
				<tr>
					<th>Type</th>
					<th>Report</th>
					<th>Rated Individual</th>
					<th>Rater</th>
					<th>Senior Rater</th>
					<th>Thru Date</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each entries as entry (entry.id)}
					{@const rated = getRatedPerson(entry.ratedPersonId)}
					{@const due = formatDueStatus(entry)}
					<tr class="clickable" onclick={() => onEdit(entry)}>
						<td
							><Badge
								label={entry.evalType}
								color={entry.evalType === 'OER' ? '#3b82f6' : entry.evalType === 'WOER' ? '#8b5cf6' : '#059669'}
							/></td
						>
						<td class="report-cell">{entry.reportType ? getReportTypeLabel(entry.reportType, entry.evalType) : '—'}</td>
						<td class="person-cell">
							{#if rated}
								<span class="rank">{rated.rank}</span> {rated.lastName}, {rated.firstName}
							{:else}
								<span class="unknown">Unknown</span>
							{/if}
						</td>
						<td class="rater-cell">{getPersonName(entry.raterPersonId, entry.raterName)}</td>
						<td class="rater-cell">{getPersonName(entry.seniorRaterPersonId, entry.seniorRaterName)}</td>
						<td>{formatDate(entry.ratingPeriodEnd)}</td>
						<td class="status-cell">
							<Badge label={due.label} color={due.color} />
							{#if entry.workflowStatus}
								<Badge
									label={getWorkflowLabel(entry.workflowStatus)}
									color={WORKFLOW_STATUS_COLORS[entry.workflowStatus]}
								/>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.table-wrapper {
		overflow-x: auto;
	}

	.rating-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.rating-table th {
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		font-weight: 600;
		color: var(--color-text-secondary);
		border-bottom: 2px solid var(--color-border);
		white-space: nowrap;
	}

	.rating-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
		color: var(--color-text);
	}

	tr.clickable {
		cursor: pointer;
		transition: background 0.1s;
	}

	tr.clickable:hover {
		background: var(--color-surface-variant);
	}

	.rank {
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.rater-cell {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.report-cell {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		white-space: nowrap;
	}

	.status-cell {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.unknown {
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
