<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { getStepperItemContext } from './context';
	import type { StepperIndicatorProps } from './types';
	import { cn } from '$lib/utils';

	let { class: className, children, ...rest }: StepperIndicatorProps = $props();
	const item = getStepperItemContext('Stepper.Indicator');
	const stepNumber = $derived(item.index >= 0 ? item.index + 1 : undefined);
</script>

{#if stepNumber}
	<span class="sr-only">Step {stepNumber}:</span>
{/if}
<span
	aria-hidden="true"
	data-slot="stepper-indicator"
	class={cn(
		'flex size-(--stepper-indicator-size) shrink-0 items-center justify-center rounded-full border border-border bg-background text-[0.625rem] font-semibold text-muted-foreground shadow-sm transition-[color,background-color,border-color,box-shadow,transform] group-hover:border-foreground/30',
		'group-data-[state=active]:border-primary group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground group-data-[state=active]:shadow-md',
		'group-data-[state=completed]:border-primary group-data-[state=completed]:bg-primary group-data-[state=completed]:text-primary-foreground',
		'group-data-[state=error]:border-destructive group-data-[state=error]:bg-destructive group-data-[state=error]:text-destructive-foreground',
		'group-data-[position=previous]:text-foreground [&>svg]:size-2.5 [&>svg]:shrink-0',
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{:else if item.stepState === 'error'}
		!
	{:else if item.stepState === 'completed'}
		<Check aria-hidden="true" />
	{:else}
		{stepNumber}
	{/if}
</span>
