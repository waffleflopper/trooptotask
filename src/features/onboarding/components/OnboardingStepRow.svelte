<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { STEP_TYPE_LABELS } from '../contexts/OnboardingPageContext.svelte';
	import type { OnboardingStepProgress } from '../onboarding.types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Spinner } from '$lib/components/ui/spinner';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import OnboardingPaperworkStageQueue from './OnboardingPaperworkStageQueue.svelte';

	interface Props {
		step: OnboardingStepProgress;
		mode: 'active' | 'inactive' | 'completed';
		canManage: boolean;
		ctx: OnboardingPageContext;
		expanded?: boolean;
		onToggleExpand?: () => void;
	}

	let { step, mode, canManage, ctx, expanded = false, onToggleExpand }: Props = $props();

	const isExpandable = $derived(mode === 'completed' && step.stepType === 'paperwork' && canManage);
	const adjustmentPanelId = $derived(`onboarding-step-${step.id}-stage-adjustment`);
</script>

{#if mode === 'active'}
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="flex items-center gap-2">
			{#if step.stepType === 'checkbox' && canManage}
				<Checkbox checked={false} onclick={() => ctx.handleToggleCheckbox(step)} />
			{:else}
				<div class="h-5 w-5 shrink-0 rounded-full border-2 border-border"></div>
			{/if}
			<span class="flex-1 text-sm font-medium">{step.stepName}</span>
			<Badge variant={step.stepType === 'training' ? 'info' : step.stepType === 'paperwork' ? 'warning' : 'secondary'}>
				{STEP_TYPE_LABELS[step.stepType]}
			</Badge>
		</div>

		{#if step.stepType === 'paperwork'}
			<OnboardingPaperworkStageQueue {step} {canManage} onSelect={(stage) => ctx.handleStageClick(step, stage)} />
		{/if}

		{#if step.stepType === 'training'}
			<div class="mt-2 pl-7">
				<Button href={ctx.trainingPageUrl} variant="outline" size="sm">Record Training</Button>
			</div>
		{/if}
	</div>
{:else if mode === 'inactive'}
	<div class="rounded-lg border border-border bg-muted/30 p-3 opacity-60">
		<div class="flex items-center gap-2">
			<div class="h-5 w-5 shrink-0 rounded-full bg-muted"></div>
			<span class="flex-1 text-sm font-medium text-muted-foreground">{step.stepName}</span>
			<Badge variant="outline">Removed</Badge>
			{#if canManage && !step.completed}
				<Button
					size="sm"
					variant="destructive"
					onclick={() => ctx.handleRemoveDeprecatedStep(step.id)}
					disabled={ctx.removingDeprecatedStepId === step.id}
				>
					{#if ctx.removingDeprecatedStepId === step.id}<Spinner />{/if}
					Remove
				</Button>
			{/if}
		</div>
	</div>
{:else}
	<div class="rounded-md border border-border/40 bg-success/5 transition-colors">
		<div class="flex items-center gap-2 p-2.5">
			{#if step.stepType === 'checkbox' && canManage}
				<Checkbox checked={true} onclick={() => ctx.handleToggleCheckbox(step)} />
			{:else}
				<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg
					>
				</div>
			{/if}
			<span class="flex-1 text-sm font-medium text-muted-foreground line-through">
				{step.stepName}
			</span>
			<Badge variant={step.stepType === 'training' ? 'info' : step.stepType === 'paperwork' ? 'warning' : 'secondary'}>
				{STEP_TYPE_LABELS[step.stepType]}
			</Badge>
			{#if isExpandable}
				<button
					onclick={onToggleExpand}
					class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					aria-label={expanded ? 'Collapse' : 'Expand to adjust'}
					aria-expanded={expanded}
					aria-controls={adjustmentPanelId}
				>
					<ChevronDown class="h-3.5 w-3.5 transition-transform {expanded ? '' : '-rotate-90'}" />
				</button>
			{/if}
		</div>
		{#if isExpandable}
			<div id={adjustmentPanelId} hidden={!expanded} class="border-t border-border/30 py-2.5 pl-9 pr-3">
				<p class="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
					Adjust stage to mark incomplete
				</p>
				<OnboardingPaperworkStageQueue
					{step}
					{canManage}
					inset={false}
					onSelect={(stage) => ctx.handleStageClick(step, stage)}
				/>
			</div>
		{/if}
	</div>
{/if}
