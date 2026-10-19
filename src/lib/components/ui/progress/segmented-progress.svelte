<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		value,
		max,
		...restProps
	}: WithoutChildrenOrChild<ProgressPrimitive.RootProps> & { value: number; max: number } = $props();
</script>

<ProgressPrimitive.Root
	bind:ref
	data-slot="segmented-progress"
	class={cn('flex w-full gap-[3px]', className)}
	{value}
	{max}
	{...restProps}
>
	{#each { length: max }, index (index)}
		<div class={cn('h-1.5 grow rounded-[1px]', index < value ? 'bg-accent' : 'bg-muted-foreground/20')}></div>
	{/each}
</ProgressPrimitive.Root>
