<script lang="ts">
	import { setStepperContext, getSafeStepperId } from './context';
	import type { StepperRootProps } from './types';
	import { cn } from '$lib/utils';

	let {
		steps,
		value,
		defaultValue,
		onValueChange,
		orientation = 'horizontal',
		class: className,
		children,
		...rest
	}: StepperRootProps = $props();

	const uid = $props.id();
	const getInitialDefaultValue = () => defaultValue;
	let uncontrolledValue = $state(getInitialDefaultValue());

	const enabledSteps = $derived(steps.filter((step) => !step.disabled));
	const selectedValue = $derived(value ?? uncontrolledValue);
	const currentStep = $derived(steps.find((step) => step.value === selectedValue && !step.disabled) ?? enabledSteps[0]);
	const currentValue = $derived(currentStep?.value);
	const currentIndex = $derived(
		currentValue === undefined ? -1 : steps.findIndex((step) => step.value === currentValue)
	);
	const previousStep = $derived(
		currentIndex < 0
			? undefined
			: steps
					.slice(0, currentIndex)
					.reverse()
					.find((step) => !step.disabled)
	);
	const nextStep = $derived(
		currentIndex < 0 ? undefined : steps.slice(currentIndex + 1).find((step) => !step.disabled)
	);

	function setValue(nextValue: string) {
		const nextStep = steps.find((step) => step.value === nextValue);
		if (!nextStep || nextStep.disabled) return;
		if (value === undefined) {
			uncontrolledValue = nextValue;
		}
		onValueChange?.(nextValue);
	}

	function goPrevious() {
		if (previousStep) {
			setValue(previousStep.value);
		}
	}

	function goNext() {
		if (nextStep) {
			setValue(nextStep.value);
		}
	}

	const context = setStepperContext({
		get value() {
			return currentValue;
		},
		get orientation() {
			return orientation;
		},
		get steps() {
			return steps;
		},
		get currentIndex() {
			return currentIndex;
		},
		get totalSteps() {
			return steps.length;
		},
		get canGoPrevious() {
			return Boolean(previousStep);
		},
		get canGoNext() {
			return Boolean(nextStep);
		},
		setValue,
		getStepIndex(stepValue: string) {
			return steps.findIndex((step) => step.value === stepValue);
		},
		getTriggerId(stepValue: string) {
			return `${uid}-trigger-${getSafeStepperId(stepValue)}`;
		},
		getContentId(stepValue: string) {
			return `${uid}-content-${getSafeStepperId(stepValue)}`;
		},
		goPrevious,
		goNext
	});
</script>

<div data-slot="stepper" data-orientation={context.orientation} class={cn('flex flex-col gap-6', className)} {...rest}>
	{@render children?.()}
</div>
