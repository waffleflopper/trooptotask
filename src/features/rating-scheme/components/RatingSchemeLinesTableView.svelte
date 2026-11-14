<script lang="ts">
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import { evalStatusBadge } from '../utils/evalStatusBadge';
	import { spokenPersonLabel } from '../utils/personLabel';
	import type { RatingSchemeLine } from '../utils/ratingSchemeLines';
	import EvalStatusBadge from './EvalStatusBadge.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { DataTable, columnCellClass, eventStartedInInteractiveDescendant } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as Table from '$lib/components/ui/table';
	import { cn } from '$lib/utils';

	interface Props {
		orgId: string;
		lines: RatingSchemeLine[];
		personnel: PersonnelLookup[];
		onEdit?: (line: RatingSchemeLine) => void;
	}

	let { orgId, lines, personnel, onEdit }: Props = $props();

	const people = $derived(new Map(personnel.map((person) => [person.id, person])));

	function evaluator(personId: string | null, name: string | null): string {
		if (personId) {
			const person = people.get(personId);
			return person ? spokenPersonLabel(person) : 'Unknown';
		}
		return name?.trim() || '—';
	}

	function ratedName(line: RatingSchemeLine): string {
		const person = people.get(line.ratedPersonId);
		return person ? spokenPersonLabel(person) : 'Unknown';
	}

	function lastName(line: RatingSchemeLine): string {
		const person = people.get(line.ratedPersonId);
		return person ? `${person.lastName} ${person.firstName}` : '';
	}

	const columns: ColumnDef<RatingSchemeLine>[] = [
		{
			key: 'ratedSoldier',
			header: 'Rated Soldier',
			value: ratedName,
			compare: (a, b) => lastName(a).localeCompare(lastName(b))
		},
		{ key: 'evalType', header: 'Eval type', value: (line) => line.evalType },
		{ key: 'rater', header: 'Rater', value: (line) => evaluator(line.raterPersonId, line.raterName) },
		{
			key: 'intermediateRater',
			header: 'Intermediate',
			value: (line) => evaluator(line.intermediateRaterPersonId, line.intermediateRaterName)
		},
		{
			key: 'seniorRater',
			header: 'Senior Rater',
			value: (line) => evaluator(line.seniorRaterPersonId, line.seniorRaterName)
		},
		{ key: 'reviewer', header: 'Reviewer', value: (line) => evaluator(line.reviewerPersonId, line.reviewerName) },
		{
			key: 'eval',
			header: 'Evaluation',
			value: (line) => evalStatusBadge(line.open)?.label ?? '',
			compare: (a, b) => (evalStatusBadge(a.open)?.step ?? 0) - (evalStatusBadge(b.open)?.step ?? 0)
		}
	];

	function handleRowClick(event: MouseEvent, line: RatingSchemeLine): void {
		if (!onEdit || eventStartedInInteractiveDescendant(event)) return;
		onEdit(line);
	}

	function handleRowKeydown(event: KeyboardEvent, line: RatingSchemeLine): void {
		if (!onEdit || (event.key !== 'Enter' && event.key !== ' ')) return;
		if (eventStartedInInteractiveDescendant(event)) return;
		event.preventDefault();
		onEdit(line);
	}
</script>

{#snippet cell(line: RatingSchemeLine, column: ColumnDef<RatingSchemeLine>)}
	{#if column.key === 'ratedSoldier'}
		<span class="font-medium">{ratedName(line)}</span>
		{#if line.archivedAt}<Badge variant="outline" class="ml-2">Archived</Badge>{/if}
	{:else if column.key === 'evalType'}
		<Badge variant="outline">{line.evalType}</Badge>
	{:else if column.key === 'eval'}
		{@const badge = evalStatusBadge(line.open)}
		{#if badge}
			<EvalStatusBadge
				{badge}
				href="/org/{orgId}/evals?entry={badge.evaluationId}"
				linkLabel="{badge.label} evaluation for {ratedName(line)}, open in Eval Tracker"
			/>
		{/if}
	{:else}
		{String(column.value(line) ?? '')}
	{/if}
{/snippet}

<DataTable
	data={lines}
	{columns}
	emptyLevel={2}
	emptyMessage="Nothing on the rating scheme."
	compact
	scrollRegionLabel="Rating scheme lines, scrollable"
	initialSortKey="ratedSoldier"
	initialSortDirection="asc"
>
	{#snippet row(line, cols)}
		<Table.Row
			class={cn(onEdit && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
			data-rating-line-id={line.id}
			tabindex={onEdit ? 0 : undefined}
			aria-label={onEdit ? `Edit rating scheme line for ${ratedName(line)}` : undefined}
			onclick={onEdit ? (event) => handleRowClick(event, line) : undefined}
			onkeydown={onEdit ? (event) => handleRowKeydown(event, line) : undefined}
		>
			{#each cols as column (column.key)}
				<Table.Cell class={columnCellClass(column)}>
					{@render cell(line, column)}
				</Table.Cell>
			{/each}
		</Table.Row>
	{/snippet}
</DataTable>
