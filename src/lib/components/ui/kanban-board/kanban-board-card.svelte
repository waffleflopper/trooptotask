<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const kanbanCardVariants = tv({
		base: 'group w-full rounded-lg border bg-card p-3 text-left text-card-foreground transition-all hover:shadow-sm',
		variants: {
			selected: {
				true: 'border-primary ring-1 ring-primary/20',
				false: 'border-border'
			}
		},
		defaultVariants: {
			selected: false
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		selected = false,
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLButtonAttributes> & {
		selected?: boolean;
		children?: Snippet;
	} = $props();
</script>

<button
	bind:this={ref}
	data-slot="kanban-board-card"
	data-selected={selected || undefined}
	class={cn(kanbanCardVariants({ selected }), className)}
	{...restProps}
>
	{@render children?.()}
</button>
