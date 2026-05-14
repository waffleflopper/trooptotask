<script lang="ts">
	import { getStepperContext } from './context';
	import type { StepperListProps } from './types';
	import { cn } from '$lib/utils';

	let { class: className, children, 'aria-label': ariaLabel = 'Progress steps', ...rest }: StepperListProps = $props();
	const stepper = getStepperContext('Stepper.List');
</script>

<ol
	aria-label={rest['aria-labelledby'] ? undefined : ariaLabel}
	data-slot="stepper-list"
	data-orientation={stepper.orientation}
	class={cn(
		'flex min-w-0',
		stepper.orientation === 'horizontal' && 'w-full gap-3 overflow-x-auto pb-2',
		stepper.orientation === 'vertical' && 'flex-col gap-4',
		className
	)}
	{...rest}
>
	{@render children?.()}
</ol>
