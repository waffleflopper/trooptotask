<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { getFieldContext } from './context.svelte.js';

	let {
		ref = $bindable(null),
		id: idProp,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();

	const uid = $props.id();
	const id = $derived(idProp ?? `${uid}-description`);
	const field = getFieldContext();
</script>

<p
	bind:this={ref}
	{id}
	{@attach () => field?.register('description', id)}
	data-slot="field-description"
	class={cn(
		'text-muted-foreground text-left text-sm [[data-variant=legend]+&]:-mt-1.5 leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance',
		'last:mt-0 nth-last-2:-mt-1',
		'[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</p>
