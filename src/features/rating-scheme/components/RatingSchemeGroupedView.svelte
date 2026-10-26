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

	// Tracks shrink from their widest toward their narrowest together, so a 1184 px workspace still fits one line.
	const rowClass =
		'relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3 pr-3.5 pl-3 text-left @3xl:grid-cols-[minmax(7rem,190px)_minmax(8.5rem,180px)_minmax(9.5rem,180px)_minmax(5.5rem,150px)_minmax(6rem,1fr)_1rem]';

	const dueCountLabels = [
		['overdue', 'past thru'],
		['due-30', 'in 30 days'],
		['due-60', 'in 31–60']
	] as const;

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
	<span class="truncate text-[15px] font-semibold @max-3xl:col-start-1 @max-3xl:row-start-1"
		>{getRatedPersonLabel(entry.ratedPersonId)}</span
	>
	<span class="flex min-w-0 items-center gap-2 @max-3xl:col-start-1 @max-3xl:row-start-2">
		<span class="shrink-0 rounded-sm border px-[5px] font-mono text-[11px] leading-4 font-medium">{entry.evalType}</span
		>
		{#if entry.reportType}
			<span class="truncate text-sm">{getReportTypeLabel(entry.reportType, entry.evalType)}</span>
		{/if}
	</span>
	<span class="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums @max-3xl:hidden">
		{formatDayMonthShortYear(entry.ratingPeriodStart)} → {formatDayMonthShortYear(entry.ratingPeriodEnd)}
	</span>
	<span
		class="truncate font-mono text-xs @max-3xl:col-start-2 @max-3xl:row-start-2 @max-3xl:text-right {entry.workflowStatus
			? ''
			: 'text-muted-foreground'}"
	>
		{entry.workflowStatus ? getWorkflowLabel(entry.workflowStatus) : 'Not tracked'}
	</span>
	<span
		class="text-right font-mono text-xs font-semibold whitespace-nowrap {tone.text} @max-3xl:col-start-2 @max-3xl:row-start-1"
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
	<div class="grid gap-9">
		{#each groups as group (group.key)}
			<section class="grid gap-1" aria-label="Senior rater {group.label}">
				<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-foreground pb-2.5">
					<h2 class="flex min-w-0 flex-wrap items-baseline gap-x-3">
						<span class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">SR</span>
						<span class="font-heading text-[28px] leading-[30px] font-extrabold wrap-anywhere uppercase">
							{group.label}
						</span>
					</h2>
					{#if group.external}
						<Badge variant="warning">External</Badge>
					{/if}
					<span class="text-sm text-muted-foreground">Senior rates {group.entryCount}</span>
					<span class="ml-auto flex flex-wrap items-baseline gap-x-2 font-mono text-xs font-medium tabular-nums">
						{#each dueCountLabels.filter(([status]) => group.dueCounts[status] > 0) as [status, label], index (status)}
							{#if index > 0}
								<span class="text-muted-foreground" aria-hidden="true">·</span>
							{/if}
							<span class={ratingDueTone[status].text}>{group.dueCounts[status]} {label}</span>
						{/each}
					</span>
				</div>
				{#each group.raterGroups as rater (rater.key)}
					<div
						class="grid items-start gap-x-6 gap-y-2 border-b py-4 last:border-b-0 lg:grid-cols-[200px_minmax(0,1fr)]"
					>
						<div class="flex min-w-0 flex-col gap-0.5 lg:pt-2.5">
							<h3 class="text-[15px] font-semibold wrap-anywhere">{rater.label}</h3>
							<p class="text-[13px] whitespace-nowrap text-muted-foreground">
								Rater · rates {rater.entries.length}
								{#if rater.external}
									<span class="text-expiring-foreground"> · External</span>
								{/if}
							</p>
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
