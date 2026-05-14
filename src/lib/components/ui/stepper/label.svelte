<script lang="ts">
	import { getStepperContext, getStepperItemContext } from './context';
	import type { StepperLabelProps } from './types';
	import { cn } from '$lib/utils';

	let { class: className, children, ...rest }: StepperLabelProps = $props();
	const stepper = getStepperContext('Stepper.Label');
	getStepperItemContext('Stepper.Label');
</script>

<span
	data-slot="stepper-label"
	class={cn(
		'min-w-0 text-sm leading-tight font-medium',
		stepper.orientation === 'horizontal' && 'max-w-40 text-balance',
		className
	)}
	{...rest}
>
	{@render children?.()}
</span>
