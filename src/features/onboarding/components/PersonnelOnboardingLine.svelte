<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import type { PersonnelOnboardingSummary } from '../onboarding.types';

	let { summary }: { summary: PersonnelOnboardingSummary } = $props();
</script>

<section class="flex flex-col gap-2 px-1" aria-labelledby="onboarding-heading">
	<h2
		id="onboarding-heading"
		class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
	>
		Onboarding
	</h2>
	{#if summary.state === 'none'}
		<p class="text-sm text-muted-foreground">No onboarding on file</p>
	{:else}
		{@const steps = `${summary.completedSteps} of ${summary.totalSteps} steps`}
		<p class="flex items-center gap-2 text-sm text-foreground">
			{#if summary.state === 'complete'}
				<CircleCheckIcon class="size-4 shrink-0 text-success-foreground" aria-hidden="true" />
				{summary.completedAt ? `Completed ${formatDayMonthYear(summary.completedAt)}` : 'Completed'} · {steps}
			{:else}
				<CircleDashedIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				In progress since {formatDayMonthYear(summary.startedAt)} · {steps}
			{/if}
		</p>
	{/if}
</section>
