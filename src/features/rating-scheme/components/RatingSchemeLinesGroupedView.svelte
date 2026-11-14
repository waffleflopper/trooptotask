<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import { evalStatusBadge } from '../utils/evalStatusBadge';
	import { groupRatingSchemeLines, type SchemeSort } from '../utils/ratingSchemeLineGroups';
	import { spokenPersonLabel } from '../utils/personLabel';
	import type { RatingSchemeLine } from '../utils/ratingSchemeLines';
	import EvalStatusBadge from './EvalStatusBadge.svelte';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		orgId: string;
		lines: RatingSchemeLine[];
		personnel: PersonnelLookup[];
		sort: SchemeSort;
		/** Opens the line to edit; absent when the viewer cannot edit. */
		onEdit?: (line: RatingSchemeLine) => void;
	}

	let { orgId, lines, personnel, sort, onEdit }: Props = $props();

	const groups = $derived(groupRatingSchemeLines(lines, personnel, sort));
	const people = $derived(new Map(personnel.map((person) => [person.id, person])));

	// Tracks shrink from their widest toward their narrowest together, so a 1184 px workspace still fits one line.
	const rowClass =
		'relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 pr-3.5 pl-4 @3xl:grid-cols-[minmax(7rem,170px)_3.5rem_minmax(6rem,150px)_minmax(6rem,150px)_minmax(0,1fr)_1rem]';

	function personName(id: string): string {
		const person = people.get(id);
		return person ? spokenPersonLabel(person) : 'Unknown';
	}

	function evaluator(personId: string | null, name: string | null): string | null {
		if (personId) {
			const person = people.get(personId);
			return person ? spokenPersonLabel(person) : 'Unknown';
		}
		return name?.trim() || null;
	}
</script>

{#snippet slot(label: string, value: string | null)}
	<span class="flex min-w-0 items-baseline gap-2 text-sm">
		<span class="font-mono text-[11px] text-muted-foreground">{label}</span>
		<span class="truncate {value ? '' : 'text-muted-foreground'}">{value ?? 'Not set'}</span>
	</span>
{/snippet}

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
				<span class="text-sm text-muted-foreground">Senior rates {group.lineCount}</span>
				{#if group.inProgress > 0}
					<span class="ml-auto font-mono text-xs font-medium text-muted-foreground tabular-nums">
						{group.inProgress}
						{group.inProgress === 1 ? 'eval' : 'evals'} in progress
					</span>
				{/if}
			</div>
			{#each group.raterGroups as rater (rater.key)}
				<div class="grid items-start gap-x-6 gap-y-2 border-b py-4 last:border-b-0 lg:grid-cols-[200px_minmax(0,1fr)]">
					<div
						class="flex min-w-0 flex-col gap-0.5 max-lg:flex-row max-lg:flex-wrap max-lg:items-baseline max-lg:gap-x-2 lg:pt-2.5"
					>
						<h3 class="text-[15px] font-semibold wrap-anywhere">{rater.label}</h3>
						<p class="text-[13px] whitespace-nowrap text-muted-foreground">
							Rater · rates {rater.lines.length}
							{#if rater.external}
								<span class="text-expiring-foreground"> · External</span>
							{/if}
						</p>
					</div>
					<ul class="@container divide-y overflow-hidden rounded-lg border bg-card text-card-foreground">
						{#each rater.lines as line (line.id)}
							{@const badge = evalStatusBadge(line.open)}
							{@const name = personName(line.ratedPersonId)}
							<li
								class="relative hover:bg-muted/60 {line.archivedAt ? 'opacity-70' : ''}"
								data-rating-line-id={line.id}
							>
								{#if onEdit}
									<button
										type="button"
										class="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
										aria-label="Edit rating scheme line for {name}"
										onclick={() => onEdit(line)}
									></button>
								{/if}
								<div class="{rowClass} pointer-events-none relative z-10">
									<span class="flex min-w-0 items-center gap-2 @3xl:contents">
										<span class="truncate text-[15px] font-semibold">
											{name}
											{#if line.archivedAt}
												<span class="ml-1 font-mono text-[11px] font-normal text-muted-foreground">Archived</span>
											{/if}
										</span>
										<span
											class="shrink-0 justify-self-start rounded-sm border px-[5px] font-mono text-[11px] leading-4 font-medium"
										>
											{line.evalType}
										</span>
									</span>
									<span
										class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 @max-3xl:col-span-2 @3xl:contents"
									>
										{@render slot('IR', evaluator(line.intermediateRaterPersonId, line.intermediateRaterName))}
										{@render slot('REV', evaluator(line.reviewerPersonId, line.reviewerName))}
									</span>
									<span class="min-w-0 @max-3xl:col-span-2 @max-3xl:empty:hidden @3xl:pl-3">
										{#if badge}
											<EvalStatusBadge
												{badge}
												href="/org/{orgId}/evals?entry={badge.evaluationId}"
												linkLabel="{badge.label} evaluation for {name}, open in Eval Tracker"
												class="pointer-events-auto"
											/>
										{/if}
									</span>
									{#if onEdit}
										<ChevronRightIcon
											class="size-4 text-muted-foreground @max-3xl:col-start-2 @max-3xl:row-start-1 @max-3xl:justify-self-end"
											aria-hidden="true"
										/>
									{:else}
										<span class="@max-3xl:hidden" aria-hidden="true"></span>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</section>
	{/each}
</div>
