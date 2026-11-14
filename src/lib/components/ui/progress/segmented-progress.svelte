<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		value,
		max,
		size = 'default',
		...restProps
	}: WithoutChildrenOrChild<ProgressPrimitive.RootProps> & {
		value: number;
		max: number;
		/** `chip` draws small fixed segments, to sit inline in a badge. */
		size?: 'default' | 'chip';
	} = $props();
</script>

<ProgressPrimitive.Root
	bind:ref
	data-slot="segmented-progress"
	class={cn('flex gap-[3px]', size === 'chip' ? 'w-fit shrink-0 gap-0.5' : 'w-full', className)}
	{value}
	{max}
	{...restProps}
>
	{#each { length: max }, index (index)}
		<div
			class={cn(
				'rounded-[1px]',
				size === 'chip' ? 'h-[9px] w-[5px] shrink-0' : 'h-1.5 grow',
				index < value ? 'bg-accent' : 'bg-muted-foreground/20'
			)}
		></div>
	{/each}
</ProgressPrimitive.Root>
