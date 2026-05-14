<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableCellElement> & {
		children?: Snippet;
		sticky?: boolean;
		rowSpan?: number;
	};

	let { children, sticky = false, rowSpan, ...restProps }: Props = $props();
</script>

<th
	scope="col"
	rowspan={rowSpan}
	data-slot="operational-matrix-corner-cell"
	data-matrix-column-header
	data-sticky-axis={sticky ? 'both' : undefined}
	{...restProps}
>
	{@render children?.()}
</th>
