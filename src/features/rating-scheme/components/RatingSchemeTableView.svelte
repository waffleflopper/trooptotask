<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import type { RatingSchemeEntry } from '../rating-scheme.types';
	import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
	import { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from '$features/rating-scheme/utils/ratingScheme';
	import { Badge } from '$lib/components/ui/badge';
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

	function formatDueStatus(entry: RatingSchemeEntry): string {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
		const days = getDaysUntilDue(entry.ratingPeriodEnd);

		if (status === 'completed') return 'Completed';
		if (status === 'overdue') return `Overdue (${Math.abs(days)}d)`;
		if (status === 'due-30') return `${days}d`;
		if (status === 'due-60') return `${days}d`;
		return 'Current';
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });
	}

	function getWorkflowLabel(status: string): string {
		return WORKFLOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
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
			value: (e) => formatDueStatus(e)
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
			<Badge variant="secondary">{row.evalType}</Badge>
		{:else if col.key === 'reportType'}
			{col.value(row)}
		{:else if col.key === 'ratedIndividual'}
			{@const rated = getRatedPerson(row.ratedPersonId)}
			{#if rated}
				{rated.rank} {rated.lastName}, {rated.firstName}
			{:else}
				Unknown
			{/if}
		{:else if col.key === 'rater' || col.key === 'seniorRater'}
			{String(col.value(row))}
		{:else if col.key === 'thruDate'}
			{formatDate(row.ratingPeriodEnd)}
		{:else if col.key === 'status'}
			<Badge variant="outline">{formatDueStatus(row)}</Badge>
			{#if row.workflowStatus}
				<Badge variant="secondary">{getWorkflowLabel(row.workflowStatus)}</Badge>
			{/if}
		{:else}
			{String(col.value(row) ?? '')}
		{/if}
	{/snippet}
</DataTable>
