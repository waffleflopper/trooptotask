<script lang="ts">
	import { getStepperContext, getStepperItemContext } from './context';
	import type { StepperDescriptionProps } from './types';
	import { cn } from '$lib/utils';

	let { class: className, children, ...rest }: StepperDescriptionProps = $props();
	const stepper = getStepperContext('Stepper.Description');
	getStepperItemContext('Stepper.Description');
</script>

<span
	data-slot="stepper-description"
	class={cn(
		'text-xs leading-snug font-normal text-muted-foreground',
		stepper.orientation === 'horizontal' && 'max-w-44 text-balance',
		className
	)}
	{...rest}
>
	{@render children?.()}
</span>
