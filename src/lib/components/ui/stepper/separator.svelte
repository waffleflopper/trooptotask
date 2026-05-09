<script lang="ts">
	import { getStepperContext, getStepperItemContext } from './context';
	import type { StepperSeparatorProps } from './types';
	import { cn } from '$lib/utils';

	let { class: className, ...rest }: StepperSeparatorProps = $props();
	const stepper = getStepperContext('Stepper.Separator');
	getStepperItemContext('Stepper.Separator');
</script>

<span
	aria-hidden="true"
	data-slot="stepper-separator"
	class={cn(
		'overflow-hidden bg-muted-foreground/25 after:absolute after:inset-0 after:bg-primary after:transition-transform after:duration-200 after:ease-out after:content-[""] motion-reduce:after:transition-none',
		stepper.orientation === 'horizontal' &&
			'absolute top-(--stepper-separator-y) right-[calc(-50%+var(--stepper-separator-offset))] left-[calc(50%+var(--stepper-separator-offset))] h-px after:origin-left after:scale-x-0 group-data-[state=completed]/stepper-item:after:scale-x-100',
		stepper.orientation === 'vertical' &&
			'absolute top-[calc(var(--stepper-indicator-size)+0.5rem)] left-[calc(var(--stepper-indicator-size)/2)] h-[calc(100%-var(--stepper-indicator-size)+0.75rem)] w-px after:origin-top after:scale-y-0 group-data-[state=completed]/stepper-item:after:scale-y-100',
		className
	)}
	{...rest}
></span>
