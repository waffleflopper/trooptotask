<script lang="ts">
	import { getStepperContext } from './context';
	import type { StepperPreviousProps } from './types';
	import { cn } from '$lib/utils';

	let {
		class: className,
		children,
		disabled = false,
		onBeforePrevious,
		onclick,
		...rest
	}: StepperPreviousProps = $props();

	const stepper = getStepperContext('Stepper.Previous');
	let isPending = $state(false);
	const isDisabled = $derived(disabled || !stepper.canGoPrevious || isPending);

	async function handleClick(event: MouseEvent) {
		onclick?.(event as MouseEvent & { currentTarget: EventTarget & HTMLButtonElement });
		if (isDisabled) {
			event.preventDefault();
			return;
		}
		if (event.defaultPrevented) return;
		isPending = true;
		try {
			const canNavigate = onBeforePrevious ? (await onBeforePrevious()) !== false : true;
			if (canNavigate) {
				stepper.goPrevious();
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
	data-slot="stepper-previous"
	data-disabled={isDisabled ? '' : undefined}
	class={cn(
		'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-[color,background-color,box-shadow,transform] hover:bg-muted hover:text-foreground active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
		className
	)}
	onclick={handleClick}
	{...rest}
>
	{#if children}
		{@render children()}
	{:else}
		Previous
	{/if}
</button>
