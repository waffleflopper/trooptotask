<script lang="ts">
	import { getStepperContext } from './context';
	import type { StepperNextProps } from './types';
	import { cn } from '$lib/utils';

	let { class: className, children, disabled = false, onBeforeNext, onclick, ...rest }: StepperNextProps = $props();

	const stepper = getStepperContext('Stepper.Next');
	let isPending = $state(false);
	const isDisabled = $derived(disabled || !stepper.canGoNext || isPending);

	async function handleClick(event: MouseEvent) {
		onclick?.(event as MouseEvent & { currentTarget: EventTarget & HTMLButtonElement });
		if (isDisabled) {
			event.preventDefault();
			return;
		}
		if (event.defaultPrevented) return;
		isPending = true;
		try {
			const canNavigate = onBeforeNext ? (await onBeforeNext()) !== false : true;
			if (canNavigate) {
				stepper.goNext();
			}
		} finally {
			isPending = false;
		}
	}
</script>

<button
	type="button"
	disabled={isDisabled}
	aria-disabled={isDisabled ? true : undefined}
	data-slot="stepper-next"
	data-disabled={isDisabled ? '' : undefined}
	class={cn(
		'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,box-shadow,transform] hover:bg-primary/90 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
		className
	)}
	onclick={handleClick}
	{...rest}
>
	{#if children}
		{@render children()}
	{:else}
		Next
	{/if}
</button>
