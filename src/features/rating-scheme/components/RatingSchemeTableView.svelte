<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import type { RatingSchemeEntry } from '../rating-scheme.types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS, WORKFLOW_STATUS_COLORS } from '../rating-scheme.types';
	import { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from '$features/rating-scheme/utils/ratingScheme';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { DataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: PersonnelLookup[];
		onEdit?: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, onEdit }: Props = $props();

	function getPersonName(id: string | null, name: string | null): string {
		if (id) {
			const p = personnel.find((p) => p.id === id);
			return p ? `${p.rank} ${p.lastName}` : 'Unknown';
		}
		return name ?? '—';
	}

	function getRatedPerson(id: string): PersonnelLookup | undefined {
		return personnel.find((p) => p.id === id);
	}

	function getRatingEntryActionLabel(entry: RatingSchemeEntry): string {
		const person = getRatedPerson(entry.ratedPersonId);
		const label = person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'unknown rated individual';
		return `Edit rating entry for ${label}`;
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

	function getEvalTypeColor(evalType: string): string {
		if (evalType === 'OER') return 'var(--info)';
		if (evalType === 'WOER') return 'var(--amber)';
		return 'var(--success)';
	}

	const columns: ColumnDef<RatingSchemeEntry>[] = [
		{
			key: 'evalType',
			header: 'Type',
			value: (e) => e.evalType
		},
		{
			key: 'reportType',
			header: 'Report',
			value: (e) => (e.reportType ? getReportTypeLabel(e.reportType, e.evalType) : '—')
		},
		{
			key: 'ratedIndividual',
			header: 'Rated Individual',
			value: (e) => {
				const p = getRatedPerson(e.ratedPersonId);
				return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
			},
			compare: (a, b) => {
				const pa = getRatedPerson(a.ratedPersonId);
				const pb = getRatedPerson(b.ratedPersonId);
				return (pa?.lastName ?? '').localeCompare(pb?.lastName ?? '');
			}
		},
		{
			key: 'rater',
			header: 'Rater',
			value: (e) => getPersonName(e.raterPersonId, e.raterName)
		},
		{
			key: 'seniorRater',
			header: 'Senior Rater',
			value: (e) => getPersonName(e.seniorRaterPersonId, e.seniorRaterName)
		},
		{
			key: 'thruDate',
			header: 'Thru Date',
			value: (e) => e.ratingPeriodEnd,
			compare: (a, b) => a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd)
		},
		{
			key: 'status',
			header: 'Status',
			value: (e) => formatDueStatus(e).label
		}
	];
</script>

<DataTable
	data={entries}
	{columns}
	emptyMessage={onEdit
		? "No rating scheme entries yet. Click 'Add Entry' to get started."
		: 'No rating scheme entries yet.'}
	onRowClick={onEdit ? (entry) => onEdit(entry) : undefined}
	rowActionLabel={onEdit ? getRatingEntryActionLabel : undefined}
	compact
	initialSortKey="thruDate"
	initialSortDirection="asc"
>
	{#snippet cell(row, col)}
		{#if col.key === 'evalType'}
			<Badge label={row.evalType} color={getEvalTypeColor(row.evalType)} />
		{:else if col.key === 'reportType'}
			<span class="report-cell">{col.value(row)}</span>
		{:else if col.key === 'ratedIndividual'}
			{@const rated = getRatedPerson(row.ratedPersonId)}
			{#if rated}
				<span class="rank">{rated.rank}</span> {rated.lastName}, {rated.firstName}
			{:else}
				<span class="unknown">Unknown</span>
			{/if}
		{:else if col.key === 'rater' || col.key === 'seniorRater'}
			<span class="rater-cell">{String(col.value(row))}</span>
		{:else if col.key === 'thruDate'}
			{formatDate(row.ratingPeriodEnd)}
		{:else if col.key === 'status'}
			{@const due = formatDueStatus(row)}
			<span class="status-cell">
				<Badge label={due.label} color={due.color} />
				{#if row.workflowStatus}
					<Badge label={getWorkflowLabel(row.workflowStatus)} color={WORKFLOW_STATUS_COLORS[row.workflowStatus]} />
				{/if}
			</span>
		{:else}
			{String(col.value(row) ?? '')}
		{/if}
	{/snippet}
</DataTable>

<style>
	.rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.rater-cell {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}

	.report-cell {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.status-cell {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.unknown {
		color: var(--text-tertiary);
		font-style: italic;
	}
</style>
