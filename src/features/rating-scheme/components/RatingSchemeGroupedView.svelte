<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import type { RatingSchemeEntry } from '../rating-scheme.types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS, WORKFLOW_STATUS_COLORS } from '../rating-scheme.types';
	import { getRatingDueStatus, getDaysUntilDue } from '$features/rating-scheme/utils/ratingScheme';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: PersonnelLookup[];
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

	function getEvalTypeColor(evalType: string): string {
		if (evalType === 'OER') return 'var(--info)';
		if (evalType === 'WOER') return 'var(--amber)';
		return 'var(--success)';
	}
</script>

{#if entries.length === 0}
	<EmptyState message="No rating scheme entries yet. Click 'Add Entry' to get started." />
{:else}
	<div class="grouped-view">
		{#each grouped as srGroup}
			<div class="sr-group">
				<div class="sr-header">
					<span class="sr-label">SR:</span>
					{srGroup.seniorRaterLabel}
				</div>
				{#each srGroup.raterGroups as rGroup}
					<div class="rater-group">
						<div class="rater-header">
							<span class="rater-label">Rater:</span>
							{rGroup.raterLabel}
						</div>
						{#each rGroup.entries as entry (entry.id)}
							{@const due = formatDueStatus(entry)}
							<button class="entry-row" type="button" onclick={() => onEdit(entry)}>
								<span class="rated-name">{getRatedPersonLabel(entry.ratedPersonId)}</span>
								<Badge
									label={entry.reportType ? `${entry.evalType}/${entry.reportType}` : entry.evalType}
									color={getEvalTypeColor(entry.evalType)}
								/>
								{#if entry.workflowStatus}
									<Badge
										label={getWorkflowLabel(entry.workflowStatus)}
										color={WORKFLOW_STATUS_COLORS[entry.workflowStatus]}
									/>
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
		gap: var(--sp-4);
	}

	.sr-group {
		border: var(--border-thin);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--surface-panel);
	}

	.sr-header {
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.sr-label {
		color: var(--amber-dark);
	}

	.rater-group {
		border-top: var(--border-thin);
	}

	.rater-header {
		padding: var(--sp-2) var(--sp-4);
		padding-left: var(--sp-8);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.rater-label {
		color: var(--text-tertiary);
	}

	.entry-row {
		appearance: none;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-4);
		padding-left: 48px;
		width: 100%;
		background: transparent;
		border: none;
		border-top: var(--border-rule);
		cursor: pointer;
		text-align: left;
		font-size: var(--text-sm);
		color: var(--text-primary);
		transition: background-color var(--transition-fast);
	}

	.entry-row:hover {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.rated-name {
		font-weight: var(--font-weight-semibold);
		min-width: 140px;
	}

	.period {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-left: auto;
	}
</style>
