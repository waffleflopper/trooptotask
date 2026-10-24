<script lang="ts">
	import { PinInput as InputOTPPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { ref = $bindable(null), cell, class: className, ...restProps }: InputOTPPrimitive.CellProps = $props();
</script>

<InputOTPPrimitive.Cell
	bind:ref
	{cell}
	data-slot="input-otp-slot"
	data-active={cell.isActive || undefined}
	class={cn(
		'relative flex h-14 min-w-0 flex-1 items-center justify-center rounded-lg border border-input bg-card font-mono text-[1.625rem] leading-8 font-medium text-foreground transition-[color,box-shadow,border-color] dark:bg-input/30',
		'data-active:z-10 data-active:border-foreground data-active:ring-3 data-active:ring-ring/30',
		'group-has-[[aria-invalid=true]]/otp:border-destructive group-has-[[aria-invalid=true]]/otp:bg-destructive/5',
		className
	)}
	{...restProps}
>
	{cell.char}
	{#if cell.hasFakeCaret}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="h-7 w-px animate-caret-blink bg-accent"></div>
		</div>
	{/if}
</InputOTPPrimitive.Cell>
