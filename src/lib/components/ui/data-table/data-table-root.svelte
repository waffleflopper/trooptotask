<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Density = 'default' | 'dense';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		density?: Density;
		striped?: boolean;
		stickyHeader?: boolean;
		stickyFirstColumn?: boolean;
		maxHeight?: string;
		constrained?: boolean;
	};

	let {
		children,
		density = 'default',
		striped = false,
		stickyHeader = false,
		stickyFirstColumn = false,
		maxHeight,
		constrained = false,
		class: className,
		...restProps
	}: Props = $props();
</script>

<div
	data-slot="data-table"
	data-density={density}
	data-striped={striped || undefined}
	data-sticky-header={stickyHeader || undefined}
	data-sticky-first-column={stickyFirstColumn || undefined}
	data-constrained={constrained || undefined}
	style:max-height={maxHeight}
	class={cn(
		'w-full min-w-0 overflow-hidden rounded-md border border-border bg-card text-card-foreground',
		'data-[constrained=true]:max-w-full',
		'[&_[data-slot=table-container]]:max-h-[inherit] [&_[data-slot=table-container]]:overflow-auto',
		'[&_[data-slot=table]]:text-sm',
		'[&_[data-slot=table-head]]:bg-muted/70 [&_[data-slot=table-head]]:font-mono [&_[data-slot=table-head]]:text-[0.6875rem] [&_[data-slot=table-head]]:font-semibold [&_[data-slot=table-head]]:uppercase [&_[data-slot=table-head]]:tracking-[0.08em] [&_[data-slot=table-head]]:text-muted-foreground',
		'[&_[data-slot=table-cell]]:text-foreground',
		'data-[density=dense]:[&_[data-slot=table-head]]:h-8 data-[density=dense]:[&_[data-slot=table-head]]:px-2 data-[density=dense]:[&_[data-slot=table-cell]]:px-2 data-[density=dense]:[&_[data-slot=table-cell]]:py-1.5',
		'data-[striped=true]:[&_[data-slot=table-body]_[data-slot=table-row]:nth-child(odd)]:bg-muted/20',
		'data-[sticky-header=true]:[&_[data-slot=table-header]]:sticky data-[sticky-header=true]:[&_[data-slot=table-header]]:top-0 data-[sticky-header=true]:[&_[data-slot=table-header]]:z-10',
		'data-[sticky-first-column=true]:[&_[data-slot=table-head]:first-child]:sticky data-[sticky-first-column=true]:[&_[data-slot=table-head]:first-child]:left-0 data-[sticky-first-column=true]:[&_[data-slot=table-head]:first-child]:z-20 data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:sticky data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:left-0 data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:z-10 data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:bg-card',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
