<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Badge } from '$lib/components/ui/badge';
	import type { GroupLabels, Tasking } from '../taskingModel';
	import type { TaskingRowFacts } from '../taskingReadModel';
	import { equipmentFact, eventRelation, nextDateFacts, peopleFact } from '../taskingRowModel';
	import ConflictMarker from './ConflictMarker.svelte';
	import ResponsibilityPill from './ResponsibilityPill.svelte';
	import { STATUS_BADGES, TONE_TEXT } from './taskingLabels';

	interface Props {
		taskingsHref: string;
		today: string;
		taskings: Tasking[];
		groups: GroupLabels;
		facts: Record<string, TaskingRowFacts>;
	}

	let { taskingsHref, today, taskings, groups, facts }: Props = $props();
	const NO_FACT = { text: '—', tone: 'muted' } as const;
</script>

<!--
	One row markup for both layouts: below the container breakpoint the cells stack into a card, and the
	responsibility, people and equipment cells share a wrapping line that becomes `contents` in the table.
-->
<div class="@container">
	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<div
			class="hidden h-9 items-center gap-3 border-b border-border bg-muted px-3.5 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase @min-[56rem]:grid @min-[56rem]:grid-cols-[104px_minmax(0,1fr)_130px_120px_120px_150px_16px]"
			aria-hidden="true"
		>
			<span>Status</span>
			<span>Tasking · event</span>
			<span>Responsible</span>
			<span>People</span>
			<span>Equipment</span>
			<span>Next date</span>
			<span></span>
		</div>
		<ul>
			{#each taskings as tasking (tasking.id)}
				{@const status = STATUS_BADGES[tasking.status.kind]}
				{@const fact = facts[tasking.id]}
				{@const people = fact ? peopleFact(fact) : NO_FACT}
				{@const equipment = fact ? equipmentFact(fact) : NO_FACT}
				{@const next = nextDateFacts(tasking, today)}
				<li class="border-b border-border last:border-b-0">
					<a
						href={`${taskingsHref}/${tasking.id}`}
						class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3.5 py-3 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset @min-[56rem]:h-[54px] @min-[56rem]:grid-cols-[104px_minmax(0,1fr)_130px_120px_120px_150px_16px] @min-[56rem]:py-0"
					>
						<span
							class="col-start-2 row-start-1 flex justify-self-end @min-[56rem]:col-start-auto @min-[56rem]:row-start-auto @min-[56rem]:justify-self-start"
						>
							<Badge variant={status.variant}>{status.label}</Badge>
						</span>
						<span
							class="col-start-1 row-start-1 grid min-w-0 gap-0.5 @min-[56rem]:col-start-auto @min-[56rem]:row-start-auto"
						>
							<span class="truncate text-sm leading-[18px] font-semibold text-foreground">{tasking.title}</span>
							<span class="truncate font-mono text-xs text-muted-foreground"
								>{eventRelation(tasking.event, fact?.eventRelation)}</span
							>
						</span>
						<span class="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 @min-[56rem]:contents">
							<span class="flex min-w-0">
								<ResponsibilityPill responsibility={tasking.responsibility} {groups} />
							</span>
							<span class="flex items-center gap-1.5 font-mono text-[13px]">
								<span class="text-muted-foreground @min-[56rem]:sr-only">People</span>
								<span class={[TONE_TEXT[people.tone], people.tone !== 'muted' && 'font-medium']}>{people.text}</span>
								{#if fact && fact.conflicts > 0}
									<ConflictMarker people={fact.conflicts} />
								{/if}
							</span>
							<span class="flex items-center gap-1.5 font-mono text-[13px]">
								<span class="text-muted-foreground @min-[56rem]:sr-only">Equipment</span>
								<span class={[TONE_TEXT[equipment.tone], equipment.tone === 'danger' && 'font-medium']}>
									{equipment.text}
								</span>
							</span>
						</span>
						<span
							class="col-span-2 flex flex-wrap gap-x-2 font-mono text-xs @min-[56rem]:col-span-1 @min-[56rem]:grid @min-[56rem]:gap-0.5"
						>
							<span class={['font-medium', TONE_TEXT[next.primary.tone]]}>{next.primary.text}</span>
							<span class="text-muted-foreground">{next.due}</span>
						</span>
						<ChevronRight class="hidden size-4 text-muted-foreground @min-[56rem]:block" aria-hidden="true" />
					</a>
				</li>
			{/each}
		</ul>
	</div>
</div>
