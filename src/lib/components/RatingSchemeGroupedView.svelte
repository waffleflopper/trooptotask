<script lang="ts">
	import type { Personnel, RatingSchemeEntry } from '$lib/types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS, WORKFLOW_STATUS_COLORS } from '$lib/types';
	import { getRatingDueStatus, getDaysUntilDue } from '$lib/utils/ratingScheme';
	import Badge from './ui/Badge.svelte';
	import EmptyState from './ui/EmptyState.svelte';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: Personnel[];
		onEdit: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, onEdit }: Props = $props();

	function getPersonDisplay(id: string | null, name: string | null): string {
		if (id) {
			const p = personnel.find((p) => p.id === id);
			return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
		}
		return name ?? 'Not Set';
	}

	function getSeniorRaterKey(entry: RatingSchemeEntry): string {
		return entry.seniorRaterPersonId || entry.seniorRaterName || 'unassigned';
	}

	function getRaterKey(entry: RatingSchemeEntry): string {
		return entry.raterPersonId || entry.raterName || 'unassigned';
	}

	interface GroupedScheme {
		seniorRaterLabel: string;
		raterGroups: {
			raterLabel: string;
			entries: RatingSchemeEntry[];
		}[];
	}

	const grouped = $derived.by<GroupedScheme[]>(() => {
		const srMap = new Map<string, Map<string, RatingSchemeEntry[]>>();

		for (const entry of entries) {
			const srKey = getSeniorRaterKey(entry);
			if (!srMap.has(srKey)) srMap.set(srKey, new Map());
			const raterMap = srMap.get(srKey)!;
			const rKey = getRaterKey(entry);
			if (!raterMap.has(rKey)) raterMap.set(rKey, []);
			raterMap.get(rKey)!.push(entry);
		}

		const result: GroupedScheme[] = [];
		for (const [srKey, raterMap] of srMap) {
			const firstEntry = [...raterMap.values()][0][0];
			const seniorRaterLabel = getPersonDisplay(firstEntry.seniorRaterPersonId, firstEntry.seniorRaterName);

			const raterGroups: GroupedScheme['raterGroups'] = [];
			for (const [, raterEntries] of raterMap) {
				const firstRaterEntry = raterEntries[0];
				raterGroups.push({
					raterLabel: getPersonDisplay(firstRaterEntry.raterPersonId, firstRaterEntry.raterName),
					entries: raterEntries.sort((a, b) => a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd))
				});
			}
			result.push({ seniorRaterLabel, raterGroups });
		}
		return result;
	});

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

	function getRatedPersonLabel(id: string): string {
		const p = personnel.find((p) => p.id === id);
		return p ? `${p.rank} ${p.lastName}` : 'Unknown';
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
	}

	function getWorkflowLabel(status: string): string {
		return WORKFLOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
	}
</script>

{#if entries.length === 0}
	<EmptyState message="No rating scheme entries yet. Click 'Add Entry' to get started." />
{:else}
	<div class="grouped-view">
		{#each grouped as srGroup}
			<div class="sr-group">
				<div class="sr-header">
					<span class="sr-label">SR:</span> {srGroup.seniorRaterLabel}
				</div>
				{#each srGroup.raterGroups as rGroup}
					<div class="rater-group">
						<div class="rater-header">
							<span class="rater-label">Rater:</span> {rGroup.raterLabel}
						</div>
						{#each rGroup.entries as entry (entry.id)}
							{@const due = formatDueStatus(entry)}
							<button class="entry-row" onclick={() => onEdit(entry)}>
								<span class="rated-name">{getRatedPersonLabel(entry.ratedPersonId)}</span>
								<Badge label={entry.reportType ? `${entry.evalType}/${entry.reportType}` : entry.evalType} color={entry.evalType === 'OER' ? '#3b82f6' : entry.evalType === 'WOER' ? '#8b5cf6' : '#059669'} />
								{#if entry.workflowStatus}
									<Badge label={getWorkflowLabel(entry.workflowStatus)} color={WORKFLOW_STATUS_COLORS[entry.workflowStatus]} />
								{/if}
								<span class="period">{formatDate(entry.ratingPeriodStart)}–{formatDate(entry.ratingPeriodEnd)}</span>
								<Badge label={due.label} color={due.color} />
							</button>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}

<style>
	.grouped-view {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.sr-group {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.sr-header {
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface-variant);
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.sr-label {
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.rater-group {
		border-top: 1px solid var(--color-divider);
	}

	.rater-header {
		padding: var(--spacing-xs) var(--spacing-md);
		padding-left: var(--spacing-xl);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		background: var(--color-surface);
	}

	.rater-label {
		color: var(--color-text-muted);
	}

	.entry-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		padding-left: 48px;
		width: 100%;
		background: none;
		border: none;
		border-top: 1px solid var(--color-divider);
		cursor: pointer;
		text-align: left;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		transition: background 0.1s;
	}

	.entry-row:hover {
		background: var(--color-surface-variant);
	}

	.rated-name {
		font-weight: 500;
		min-width: 140px;
	}

	.period {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		margin-left: auto;
	}
</style>
