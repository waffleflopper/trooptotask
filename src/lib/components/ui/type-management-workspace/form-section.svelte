<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLFieldSetElement>, HTMLFieldSetElement> {
		title: string;
		layout?: 'stack' | 'two-column';
		children?: Snippet;
	}

	let { ref = $bindable(null), class: className, title, layout = 'stack', children, ...restProps }: Props = $props();
</script>

<fieldset
	bind:this={ref}
	data-slot="type-management-workspace-form-section"
	class={cn(
		'grid gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0',
		layout === 'two-column' && 'sm:grid-cols-2',
		className
	)}
	{...restProps}
>
	<legend
		data-slot="type-management-workspace-form-section-title"
		class={cn('font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase')}
	>
		{title}
	</legend>
	{@render children?.()}
</fieldset>
