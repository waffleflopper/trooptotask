<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { OperationalMatrixRow } from './types.js';

	type Props = HTMLAttributes<HTMLTableCellElement> & {
		row: OperationalMatrixRow;
		children?: Snippet;
		sticky?: boolean;
	};

	let { row, children, sticky = false, ...restProps }: Props = $props();
</script>

<th
	scope="row"
	data-slot="operational-matrix-row-header"
	data-matrix-row-header
	data-row-id={row.id}
	data-disabled={row.disabled || undefined}
	data-readonly={row.readOnly || undefined}
	data-sticky-axis={sticky ? 'inline-start' : undefined}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		{row.label}
	{/if}
</th>
