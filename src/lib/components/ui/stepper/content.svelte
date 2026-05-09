<script lang="ts">
	import { getStepperContext } from './context';
	import type { StepperContentProps } from './types';
	import { cn } from '$lib/utils';

	let { value, forceMount = false, class: className, children, ...rest }: StepperContentProps = $props();
	const stepper = getStepperContext('Stepper.Content');
	const isActive = $derived(stepper.value === value);
</script>

{#if forceMount || isActive}
	<div
		id={stepper.getContentId(value)}
		role="region"
		aria-labelledby={stepper.getTriggerId(value)}
		data-slot="stepper-content"
		data-state={isActive ? 'active' : 'inactive'}
		hidden={forceMount ? !isActive : undefined}
		class={cn('rounded-md border border-border/70 bg-muted/25 p-4 text-sm text-foreground shadow-sm', className)}
		{...rest}
	>
		{@render children?.()}
	</div>
{/if}
