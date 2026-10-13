<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import type { OnboardingStepProgress } from '../onboarding.types';
	import { stepHeadline } from '../onboardingMatrix';
	import { isStepStalled, type Today } from '../onboardingStatus';
	import { Button } from '$lib/components/ui/button';
	import OnboardingStageControls from './OnboardingStageControls.svelte';
	import OnboardingStepNotes from './OnboardingStepNotes.svelte';

	interface Props {
		ctx: OnboardingPageContext;
		step: OnboardingStepProgress;
		/** Surname of the Soldier whose packet this step belongs to. */
		surname: string;
		today: Today;
		canManage: boolean;
	}

	let { ctx, step, surname, today, canManage }: Props = $props();

	const stalled = $derived(isStepStalled(step, today));
</script>

<div class="grid gap-3">
	<div class="grid gap-0.5">
		<p class="font-mono text-xs uppercase tracking-wider text-muted-foreground">{surname} · {step.stepName}</p>
		<p class={['text-sm font-semibold', stalled && 'text-warning-foreground']}>{stepHeadline(step, today)}</p>
	</div>

	{#if step.stepType === 'paperwork'}
		<OnboardingStageControls {step} {today} {canManage} onSelect={(stage) => ctx.handleStageClick(step, stage)} />
	{:else if step.stepType === 'training' && !step.completed && ctx.canOpenTraining}
		<Button href={ctx.trainingPageUrl} variant="link" size="none" class="h-auto justify-start p-0 text-sm">
			Record training
		</Button>
	{:else if step.stepType === 'checkbox' && step.completed && canManage}
		<Button
			variant="outline"
			size="sm"
			class="justify-self-start"
			onclick={() => ctx.handleToggleCheckbox(step)}
			aria-label={`Mark ${step.stepName} incomplete`}
		>
			Mark incomplete
		</Button>
	{/if}

	<div class="grid gap-2 border-t border-border pt-2">
		<OnboardingStepNotes {ctx} {step} {canManage} latestOnly />
	</div>
</div>
