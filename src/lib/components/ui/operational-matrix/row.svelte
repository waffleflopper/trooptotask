<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { OperationalMatrixRow } from './types.js';

	type Props = HTMLAttributes<HTMLTableRowElement> & {
		row: OperationalMatrixRow;
		children?: Snippet;
		virtualIndex?: number;
	};

	let { row, children, virtualIndex, ...restProps }: Props = $props();
</script>

<tr
	data-slot="operational-matrix-row"
	data-matrix-row
	data-row-id={row.id}
	data-disabled={row.disabled || undefined}
	data-readonly={row.readOnly || undefined}
	aria-rowindex={virtualIndex}
	{...restProps}
>
	{@render children?.()}
</tr>
