<script lang="ts">
	import { SegmentedProgress } from '$lib/components/ui/progress/index.js';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import type { PersonnelActiveEvaluation } from '../rating-scheme.types';
	import { EVALUATION_PHASE_COUNT } from '../utils/evaluationPhase';

	let { evaluation }: { evaluation: PersonnelActiveEvaluation | null } = $props();

	function thru(days: number): string {
		if (days === 0) return 'thru today';
		if (days > 0) return `thru in ${days} ${days === 1 ? 'day' : 'days'}`;
		return `thru ${-days} ${days === -1 ? 'day' : 'days'} ago`;
	}

	const evaluators = $derived(
		evaluation
			? [
					['Rater', evaluation.rater],
					['Senior rater', evaluation.seniorRater],
					['Intermediate rater', evaluation.intermediateRater],
					['Reviewer', evaluation.reviewer]
				].filter((entry): entry is [string, string] => entry[1] !== null)
			: []
	);
</script>

<section class="flex flex-col gap-3.5 rounded-md border bg-muted p-5" aria-labelledby="evaluation-heading">
	<h2
		id="evaluation-heading"
		class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
	>
		Evaluation
	</h2>
	{#if evaluation}
		<div class="flex flex-col gap-0.5">
			<p class="font-heading text-[26px] leading-7 font-bold text-foreground">
				{[evaluation.reportTypeLabel, evaluation.evalType].filter(Boolean).join(' ')}
			</p>
			<p class="text-sm text-secondary-foreground">
				{formatDayMonthYear(evaluation.periodStart)} – {formatDayMonthYear(evaluation.periodEnd)} · {thru(
					evaluation.daysUntilThru
				)}
			</p>
		</div>
		<div class="flex flex-col gap-1.5">
			<SegmentedProgress
				value={evaluation.phase.step}
				max={EVALUATION_PHASE_COUNT}
				aria-label={`Evaluation step ${evaluation.phase.step} of ${EVALUATION_PHASE_COUNT}`}
			/>
			<p class="text-[13px] leading-[18px] text-muted-foreground">
				{evaluation.phase.label} · step {evaluation.phase.step} of {EVALUATION_PHASE_COUNT}
			</p>
		</div>
		{#if evaluators.length > 0}
			<div class="h-px bg-border"></div>
			<dl class="grid grid-cols-[6rem_1fr] items-baseline gap-x-3 gap-y-2 text-sm">
				{#each evaluators as [role, name] (role)}
					<dt class="text-muted-foreground">{role}</dt>
					<dd class="font-medium text-foreground">{name}</dd>
				{/each}
			</dl>
		{/if}
	{:else}
		<p class="text-sm text-muted-foreground">No evaluation in progress.</p>
	{/if}
</section>
