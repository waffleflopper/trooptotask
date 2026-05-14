<script lang="ts">
	import { setStepperItemContext, getStepperContext } from './context';
	import Description from './description.svelte';
	import Indicator from './indicator.svelte';
	import Label from './label.svelte';
	import Separator from './separator.svelte';
	import Trigger from './trigger.svelte';
	import type { StepperItemProps, StepperStepPosition, StepperStepState } from './types';
	import { cn } from '$lib/utils';

	let {
		value,
		label,
		description,
		completed = false,
		disabled = false,
		error = false,
		class: className,
		children,
		...rest
	}: StepperItemProps = $props();

	const stepper = getStepperContext('Stepper.Item');
	const step = $derived(stepper.steps.find((candidate) => candidate.value === value));
	const mergedDisabled = $derived(disabled || Boolean(step?.disabled));
	const mergedCompleted = $derived(completed || Boolean(step?.completed));
	const mergedError = $derived(error || Boolean(step?.error));
	const stepLabel = $derived(label ?? step?.label ?? value);
	const stepDescription = $derived(description ?? step?.description);
	const index = $derived(stepper.getStepIndex(value));
	const isActive = $derived(stepper.value === value);
	const stepPosition = $derived.by<StepperStepPosition>(() => {
		if (stepper.currentIndex < 0 || index < 0) return 'next';
		if (index < stepper.currentIndex) return 'previous';
		if (index === stepper.currentIndex) return 'current';
		return 'next';
	});
	const stepState = $derived.by<StepperStepState>(() => {
		if (mergedDisabled) return 'disabled';
		if (mergedError) return 'error';
		if (isActive) return 'active';
		if (mergedCompleted) return 'completed';
		return 'inactive';
	});
	const isLastStep = $derived(index >= 0 && index === stepper.steps.length - 1);

	const itemContext = setStepperItemContext({
		get value() {
			return value;
		},
		get index() {
			return index;
		},
		get disabled() {
			return mergedDisabled;
		},
		get isActive() {
			return isActive;
		},
		get stepState() {
			return stepState;
		},
		get stepPosition() {
			return stepPosition;
		},
		get triggerId() {
			return stepper.getTriggerId(value);
		},
		get contentId() {
			return stepper.getContentId(value);
		}
	});
</script>

<li
	data-slot="stepper-item"
	data-orientation={stepper.orientation}
	data-state={itemContext.stepState}
	data-position={itemContext.stepPosition}
	data-disabled={itemContext.disabled ? '' : undefined}
	data-error={mergedError ? '' : undefined}
	data-completed={mergedCompleted ? '' : undefined}
	class={cn(
		'group/stepper-item relative flex min-w-0 [--stepper-indicator-size:1.125rem] [--stepper-separator-offset:calc(var(--stepper-indicator-size)/2+0.375rem)] [--stepper-separator-y:calc(var(--stepper-indicator-size)/2)]',
		stepper.orientation === 'horizontal' && 'min-w-28 flex-1 flex-col items-center',
		stepper.orientation === 'vertical' && 'items-start gap-3',
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{:else}
		<Trigger>
			<Indicator />
			<span class="grid min-w-0 gap-1">
				<Label>{stepLabel}</Label>
				{#if stepDescription}
					<Description>{stepDescription}</Description>
				{/if}
			</span>
		</Trigger>
	{/if}
	{#if !isLastStep}
		<Separator />
	{/if}
</li>
