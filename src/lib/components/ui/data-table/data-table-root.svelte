<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Density = 'default' | 'dense';
	/** `editorial` drops the frame and fill so the table reads as ruled rows on the page, as editorial settings lists do. */
	type Variant = 'framed' | 'editorial';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		density?: Density;
		variant?: Variant;
		stacked?: boolean;
		striped?: boolean;
		stickyHeader?: boolean;
		stickyFirstColumn?: boolean;
		maxHeight?: string;
		constrained?: boolean;
	};

	let {
		children,
		density = 'default',
		variant = 'framed',
		stacked = false,
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
	data-variant={variant}
	data-stacked={stacked || undefined}
	data-striped={striped || undefined}
	data-sticky-header={stickyHeader || undefined}
	data-sticky-first-column={stickyFirstColumn || undefined}
	data-constrained={constrained || undefined}
	style:max-height={maxHeight}
	class={cn(
		'@container/data-table w-full min-w-0 overflow-hidden',
		variant === 'framed' && 'rounded-md border border-border bg-card text-card-foreground',
		'data-[constrained=true]:max-w-full',
		'[&_[data-slot=table-container]]:max-h-[inherit] [&_[data-slot=table-container]]:overflow-auto',
		'[&_[data-slot=table]]:text-sm',
		'[&_[data-slot=table-head]]:bg-muted/70 [&_[data-slot=table-head]]:font-mono [&_[data-slot=table-head]]:text-[0.6875rem] [&_[data-slot=table-head]]:font-semibold [&_[data-slot=table-head]]:uppercase [&_[data-slot=table-head]]:tracking-[0.08em] [&_[data-slot=table-head]]:text-muted-foreground [&_[data-slot=table-head]]:[overflow-wrap:anywhere]',
		'[&_[data-slot=table-cell]]:max-w-80 [&_[data-slot=table-cell]]:text-foreground [&_[data-slot=table-cell]]:[overflow-wrap:anywhere]',
		'[&_[data-slot=table-cell][data-max-width=none]]:max-w-none',
		'data-[density=dense]:[&_[data-slot=table-head]]:h-8 data-[density=dense]:[&_[data-slot=table-head]]:px-2 data-[density=dense]:[&_[data-slot=table-cell]]:px-2 data-[density=dense]:[&_[data-slot=table-cell]]:py-1.5',
		'data-[variant=editorial]:[&_[data-slot=table-head]]:bg-transparent data-[variant=editorial]:[&_[data-slot=table-head]:first-child]:pl-0 data-[variant=editorial]:[&_[data-slot=table-cell]:first-child]:pl-0 data-[variant=editorial]:[&_[data-slot=table-head]:last-child]:pr-0 data-[variant=editorial]:[&_[data-slot=table-cell]:last-child]:pr-0 data-[variant=editorial]:[&_[data-slot=table-body]_[data-slot=table-row]:last-child]:border-b',
		'@max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table]]:block @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-header]]:block @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-body]]:block',
		'@max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-row]]:flex @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-row]]:flex-wrap @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-row]]:items-baseline @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-row]]:gap-x-3 @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-row]]:gap-y-1',
		'@max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-header]_[data-slot=table-row]]:py-2 @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-row]:has(>[data-slot=table-cell])]:py-2.5',
		'@max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-head]]:h-auto @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-head]]:w-auto! @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-head]]:p-0',
		'@max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-cell]]:block @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-cell]]:p-0 @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-cell]]:whitespace-normal @max-2xl/data-table:data-[stacked=true]:[&_[data-slot=table-cell][data-max-width=none]]:basis-full',
		'data-[striped=true]:[&_[data-slot=table-body]_[data-slot=table-row]:nth-child(odd)]:bg-muted/20',
		'data-[sticky-header=true]:[&_[data-slot=table-header]]:sticky data-[sticky-header=true]:[&_[data-slot=table-header]]:top-0 data-[sticky-header=true]:[&_[data-slot=table-header]]:z-10',
		'data-[sticky-first-column=true]:[&_[data-slot=table-head]:first-child]:sticky data-[sticky-first-column=true]:[&_[data-slot=table-head]:first-child]:left-0 data-[sticky-first-column=true]:[&_[data-slot=table-head]:first-child]:z-20 data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:sticky data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:left-0 data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:z-10 data-[sticky-first-column=true]:[&_[data-slot=table-cell]:first-child]:bg-card',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
