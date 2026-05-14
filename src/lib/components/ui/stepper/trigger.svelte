<script lang="ts">
	import { getStepperContext, getStepperItemContext } from './context';
	import type { StepperStep, StepperTriggerProps } from './types';
	import { cn } from '$lib/utils';

	let { class: className, children, disabled = false, onclick, onkeydown, ...rest }: StepperTriggerProps = $props();

	const stepper = getStepperContext('Stepper.Trigger');
	const item = getStepperItemContext('Stepper.Trigger');
	const isDisabled = $derived(item.disabled || disabled);

	function getKeyboardNavigationStepValue(key: string, steps: StepperStep[], value: string) {
		const enabledSteps = steps.filter((step) => !step.disabled);
		const currentIndex = enabledSteps.findIndex((step) => step.value === value);
		if (currentIndex < 0) return undefined;
		if (key === 'Home') return enabledSteps.at(0)?.value;
		if (key === 'End') return enabledSteps.at(-1)?.value;
		if (
			(stepper.orientation === 'horizontal' && key === 'ArrowRight') ||
			(stepper.orientation === 'vertical' && key === 'ArrowDown')
		) {
			return enabledSteps[Math.min(currentIndex + 1, enabledSteps.length - 1)]?.value;
		}
		if (
			(stepper.orientation === 'horizontal' && key === 'ArrowLeft') ||
			(stepper.orientation === 'vertical' && key === 'ArrowUp')
		) {
			return enabledSteps[Math.max(currentIndex - 1, 0)]?.value;
		}
		return undefined;
	}

	function handleClick(event: MouseEvent) {
		onclick?.(event as MouseEvent & { currentTarget: EventTarget & HTMLButtonElement });
		if (isDisabled) {
			event.preventDefault();
			return;
		}
		if (!event.defaultPrevented) {
			stepper.setValue(item.value);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		onkeydown?.(event as KeyboardEvent & { currentTarget: EventTarget & HTMLButtonElement });
		if (event.defaultPrevented || isDisabled) return;
		const targetStepValue = getKeyboardNavigationStepValue(event.key, stepper.steps, item.value);
		if (!targetStepValue || targetStepValue === item.value) return;
		const targetTrigger = document.getElementById(stepper.getTriggerId(targetStepValue));
		if (targetTrigger instanceof HTMLElement) {
			event.preventDefault();
			targetTrigger.focus();
		}
	}
</script>

<button
	id={item.triggerId}
	type="button"
	aria-current={item.isActive ? 'step' : undefined}
	aria-controls={item.isActive ? item.contentId : undefined}
	aria-disabled={isDisabled ? true : undefined}
	disabled={isDisabled}
	data-slot="stepper-trigger"
	data-state={item.stepState}
	data-disabled={isDisabled ? '' : undefined}
	class={cn(
		'group inline-flex min-h-10 min-w-0 items-center gap-2 rounded-md text-left text-sm font-medium text-muted-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] hover:text-foreground active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
		'data-[state=active]:text-foreground data-[state=completed]:text-foreground data-[state=error]:text-destructive',
		stepper.orientation === 'horizontal' && 'w-full flex-col items-center text-center',
		stepper.orientation === 'vertical' && 'justify-start',
		className
	)}
	onclick={handleClick}
	onkeydown={handleKeydown}
	{...rest}
>
	{@render children?.()}
</button>
