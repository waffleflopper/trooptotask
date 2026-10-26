<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeEntry } from '../rating-scheme.types';
	import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
	import { getRatingDueLabel, getReportTypeLabel } from '../utils/ratingScheme';
	import { ratingDueTone } from '../utils/ratingDueTone';
	import { groupRatingSchemeEntries, type GroupedSort } from '../utils/ratingSchemeGroups';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { formatDayMonthShortYear } from '$lib/utils/dates';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: PersonnelLookup[];
		sort?: GroupedSort;
		onEdit?: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, sort = 'urgency', onEdit }: Props = $props();

	const groups = $derived(groupRatingSchemeEntries(entries, personnel, sort));

	const rowClass =
		'relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-2.5 pr-4 pl-5 text-left text-sm @3xl:grid-cols-[minmax(6rem,10rem)_minmax(8.5rem,12rem)_10.5rem_minmax(0,1fr)_6.5rem_1rem]';

	function getRatedPersonLabel(id: string): string {
		const p = personnel.find((p) => p.id === id);
		return p ? `${p.rank} ${p.lastName}` : 'Unknown';
	}

	function getWorkflowLabel(status: string): string {
		return WORKFLOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
	}
</script>

{#snippet rowBody(entry: RatingSchemeEntry)}
	{@const due = getRatingDueLabel(entry.ratingPeriodEnd, entry.status)}
	{@const tone = ratingDueTone[due.status]}
	<span class="absolute inset-y-0 left-0 w-0.75 {tone.rail}" aria-hidden="true"></span>
	<span class="truncate font-medium @max-3xl:col-start-1 @max-3xl:row-start-1"
		>{getRatedPersonLabel(entry.ratedPersonId)}</span
	>
	<span class="flex min-w-0 items-center gap-2 @max-3xl:col-start-1 @max-3xl:row-start-2">
		<Badge variant="outline">{entry.evalType}</Badge>
		{#if entry.reportType}
			<span class="truncate text-muted-foreground">{getReportTypeLabel(entry.reportType, entry.evalType)}</span>
		{/if}
	</span>
	<span class="whitespace-nowrap text-muted-foreground tabular-nums @max-3xl:hidden">
		{formatDayMonthShortYear(entry.ratingPeriodStart)} – {formatDayMonthShortYear(entry.ratingPeriodEnd)}
	</span>
	<span
		class="truncate text-muted-foreground @max-3xl:col-start-2 @max-3xl:row-start-2 @max-3xl:text-right {entry.workflowStatus
			? 'text-foreground'
			: ''}"
	>
		{entry.workflowStatus ? getWorkflowLabel(entry.workflowStatus) : 'Not tracked'}
	</span>
	<span class="text-right font-medium whitespace-nowrap {tone.text} @max-3xl:col-start-2 @max-3xl:row-start-1"
		>{due.text}</span
	>
	{#if onEdit}
		<ChevronRightIcon class="size-4 text-muted-foreground @max-3xl:hidden" aria-hidden="true" />
	{:else}
		<span class="@max-3xl:hidden" aria-hidden="true"></span>
	{/if}
{/snippet}

{#if entries.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Title>No rating scheme entries yet</Empty.Title>
			<Empty.Description>Click Add Entry to get started.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="grid gap-8">
		{#each groups as group (group.key)}
			<section class="grid gap-3" aria-label="Senior rater {group.label}">
				<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<h2 class="font-heading text-lg font-semibold">
						<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">SR</span>
						{group.label}
					</h2>
					{#if group.external}
						<Badge variant="warning">External</Badge>
					{/if}
					<span class="text-sm text-muted-foreground">Senior rates {group.entryCount}</span>
					<span class="ml-auto flex flex-wrap gap-x-3 text-sm font-medium tabular-nums">
						{#if group.dueCounts.overdue > 0}
							<span class={ratingDueTone.overdue.text}>{group.dueCounts.overdue} past thru</span>
						{/if}
						{#if group.dueCounts['due-30'] > 0}
							<span class={ratingDueTone['due-30'].text}>{group.dueCounts['due-30']} in 30d</span>
						{/if}
						{#if group.dueCounts['due-60'] > 0}
							<span class={ratingDueTone['due-60'].text}>{group.dueCounts['due-60']} in 31–60d</span>
						{/if}
					</span>
				</div>
				{#each group.raterGroups as rater (rater.key)}
					<div class="grid items-start gap-x-6 gap-y-2 lg:grid-cols-[13rem_minmax(0,1fr)]">
						<div class="min-w-0">
							<h3 class="flex flex-wrap items-center gap-x-2 text-sm font-medium">
								<span class="wrap-anywhere">{rater.label}</span>
								{#if rater.external}
									<Badge variant="warning">External</Badge>
								{/if}
							</h3>
							<p class="text-xs text-muted-foreground">Rater · rates {rater.entries.length}</p>
						</div>
						<ul class="@container divide-y overflow-hidden rounded-lg border bg-card text-card-foreground">
							{#each rater.entries as entry (entry.id)}
								<li>
									{#if onEdit}
										<Button
											variant="cell"
											size="none"
											class="{rowClass} h-auto justify-start whitespace-normal"
											data-rating-entry-id={entry.id}
											onclick={() => onEdit(entry)}
										>
											{@render rowBody(entry)}
										</Button>
									{:else}
										<div class={rowClass} data-rating-entry-id={entry.id}>
											{@render rowBody(entry)}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</section>
		{/each}
	</div>
{/if}
