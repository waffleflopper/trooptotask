<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { toggleVariants, type ToggleVariants } from '$lib/components/ui/toggle/index.js';
	import { cn } from '$lib/utils.js';
	import { getToggleGroupCtx } from './toggle-group.svelte';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size,
		variant,
		...restProps
	}: ToggleGroupPrimitive.ItemProps & ToggleVariants = $props();

	const ctx = getToggleGroupCtx();
	const resolvedVariant = $derived(ctx.variant || variant);
	const resolvedSize = $derived(ctx.size || size);
</script>

<ToggleGroupPrimitive.Item
	bind:ref
	data-slot="toggle-group-item"
	data-variant={resolvedVariant}
	data-size={resolvedSize}
	class={cn(
		toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
		'min-w-0 shrink-0 focus:z-10 focus-visible:z-10 data-[state=on]:bg-background data-[state=on]:shadow-xs',
		className
	)}
	{value}
	{...restProps}
/>
