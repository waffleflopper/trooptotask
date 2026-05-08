<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { OperationalMatrixColumn } from './types.js';

	type Props = HTMLAttributes<HTMLTableCellElement> & {
		column: OperationalMatrixColumn;
		children?: Snippet;
		sticky?: boolean;
	};

	let { column, children, sticky = false, ...restProps }: Props = $props();
</script>

<th
	scope="col"
	data-slot="operational-matrix-column-header"
	data-matrix-column-header
	data-column-id={column.id}
	data-disabled={column.disabled || undefined}
	data-readonly={column.readOnly || undefined}
	data-sticky-axis={sticky ? 'block-start' : undefined}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		{column.label}
	{/if}
</th>
