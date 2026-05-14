<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import type { OperationalMatrixColumn } from './types.js';

	type Props = HTMLAttributes<HTMLTableCellElement> & {
		column: OperationalMatrixColumn;
		children?: Snippet;
		sticky?: boolean;
		orientation?: 'horizontal' | 'vertical';
	};

	let {
		column,
		children,
		sticky = false,
		orientation = 'horizontal',
		class: className,
		...restProps
	}: Props = $props();
</script>

<th
	scope="col"
	data-slot="operational-matrix-column-header"
	data-matrix-column-header
	data-column-id={column.id}
	data-disabled={column.disabled || undefined}
	data-readonly={column.readOnly || undefined}
	data-sticky-axis={sticky ? 'block-start' : undefined}
	data-orientation={orientation}
	class={cn(orientation === 'vertical' && 'h-44 w-12 min-w-12 max-w-12 px-1 py-2 align-bottom', className)}
	{...restProps}
>
	{#if orientation === 'vertical'}
		<span
			data-slot="operational-matrix-column-header-label"
			class="mx-auto flex h-40 w-10 items-center justify-center overflow-hidden"
		>
			<span class="-rotate-90 grid w-36 max-w-36 gap-1 whitespace-normal text-center text-[10px] leading-tight">
				{#if children}
					{@render children()}
				{:else}
					{column.label}
				{/if}
			</span>
		</span>
	{:else if children}
		{@render children()}
	{:else}
		{column.label}
	{/if}
</th>
