<script lang="ts">
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingDueStatus, RatingSchemeEntry } from '../rating-scheme.types';
	import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
	import { getRatingDueLabel, getReportTypeLabel } from '../utils/ratingScheme';
	import { ratingDueTone } from '../utils/ratingDueTone';
	import { Badge } from '$lib/components/ui/badge';
	import { DataTable, columnCellClass, eventStartedInInteractiveDescendant } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as Table from '$lib/components/ui/table';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { cn } from '$lib/utils';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: PersonnelLookup[];
		onEdit?: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, onEdit }: Props = $props();

	const statusOrder: Record<RatingDueStatus, number> = {
		overdue: 0,
		'due-30': 1,
		'due-60': 2,
		current: 3,
		completed: 4
	};

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

	function getRatedPersonLabel(entry: RatingSchemeEntry): string {
		const p = getRatedPerson(entry.ratedPersonId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}

	function getRatingEntryActionLabel(entry: RatingSchemeEntry): string {
		const person = getRatedPerson(entry.ratedPersonId);
		const label = person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'unknown rated individual';
		return `Edit rating entry for ${label}`;
	}

	function getWorkflowLabel(status: string | null): string {
		if (!status) return '—';
		return WORKFLOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
	}

	function dueLabel(entry: RatingSchemeEntry) {
		return getRatingDueLabel(entry.ratingPeriodEnd, entry.status);
	}

	const columns: ColumnDef<RatingSchemeEntry>[] = [
		{
			key: 'status',
			header: 'Status',
			value: (e) => dueLabel(e).text,
			compare: (a, b) =>
				statusOrder[dueLabel(a).status] - statusOrder[dueLabel(b).status] ||
				a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd)
		},
		{
			key: 'ratedIndividual',
			header: 'Rated Soldier',
			value: getRatedPersonLabel,
			compare: (a, b) => {
				const pa = getRatedPerson(a.ratedPersonId);
				const pb = getRatedPerson(b.ratedPersonId);
				return (
					(pa?.lastName ?? '').localeCompare(pb?.lastName ?? '') ||
					(pa?.firstName ?? '').localeCompare(pb?.firstName ?? '')
				);
			}
		},
		{
			key: 'eval',
			header: 'Eval',
			value: (e) => `${e.evalType} ${e.reportType ? getReportTypeLabel(e.reportType, e.evalType) : ''}`.trim()
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
			header: 'Thru',
			value: (e) => e.ratingPeriodEnd,
			compare: (a, b) => a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd)
		},
		{
			key: 'workflow',
			header: 'Workflow',
			value: (e) => getWorkflowLabel(e.workflowStatus)
		}
	];

	function handleRowClick(event: MouseEvent, entry: RatingSchemeEntry): void {
		if (!onEdit || eventStartedInInteractiveDescendant(event)) return;
		onEdit(entry);
	}

	function handleRowKeydown(event: KeyboardEvent, entry: RatingSchemeEntry): void {
		if (!onEdit || (event.key !== 'Enter' && event.key !== ' ')) return;
		if (eventStartedInInteractiveDescendant(event)) return;
		event.preventDefault();
		onEdit(entry);
	}
</script>

{#snippet cell(entry: RatingSchemeEntry, column: ColumnDef<RatingSchemeEntry>)}
	{#if column.key === 'status'}
		{@const due = dueLabel(entry)}
		<span class={cn('pl-1 font-medium', ratingDueTone[due.status].text)}>{due.text}</span>
	{:else if column.key === 'eval'}
		<span class="inline-flex items-center gap-2">
			<Badge variant="outline">{entry.evalType}</Badge>
			{#if entry.reportType}
				<span class="text-muted-foreground">{getReportTypeLabel(entry.reportType, entry.evalType)}</span>
			{/if}
		</span>
	{:else if column.key === 'rater' || column.key === 'seniorRater'}
		{@const external =
			column.key === 'rater'
				? !entry.raterPersonId && !!entry.raterName
				: !entry.seniorRaterPersonId && !!entry.seniorRaterName}
		{String(column.value(entry))}
		{#if external}
			<span class="ml-1 text-xs text-muted-foreground">ext</span>
		{/if}
	{:else if column.key === 'thruDate'}
		<span class="tabular-nums">{formatDayMonthYear(entry.ratingPeriodEnd)}</span>
	{:else if column.key === 'workflow'}
		<span class={entry.workflowStatus ? undefined : 'text-muted-foreground'}
			>{getWorkflowLabel(entry.workflowStatus)}</span
		>
	{:else}
		{String(column.value(entry) ?? '')}
	{/if}
{/snippet}

<DataTable
	data={entries}
	{columns}
	emptyLevel={2}
	emptyMessage={onEdit
		? "No rating scheme entries yet. Click 'Add Entry' to get started."
		: 'No rating scheme entries yet.'}
	compact
	scrollRegionLabel="Rating scheme entries, scrollable"
	initialSortKey="ratedIndividual"
	initialSortDirection="asc"
>
	{#snippet row(entry, cols)}
		<Table.Row
			class={cn(onEdit && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
			data-rating-entry-id={entry.id}
			tabindex={onEdit ? 0 : undefined}
			aria-label={onEdit ? getRatingEntryActionLabel(entry) : undefined}
			onclick={onEdit ? (event) => handleRowClick(event, entry) : undefined}
			onkeydown={onEdit ? (event) => handleRowKeydown(event, entry) : undefined}
		>
			{#each cols as column, index (column.key)}
				<Table.Cell class={cn(columnCellClass(column), index === 0 && ratingDueTone[dueLabel(entry).status].insetRail)}>
					{@render cell(entry, column)}
				</Table.Cell>
			{/each}
		</Table.Row>
	{/snippet}
</DataTable>
