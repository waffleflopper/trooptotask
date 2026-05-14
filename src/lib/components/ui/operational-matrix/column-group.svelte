<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableCellElement> & {
		label?: string;
		columnSpan: number;
		children?: Snippet;
		sticky?: boolean;
	};

	let { label, columnSpan, children, sticky = false, ...restProps }: Props = $props();
</script>

<th
	scope="colgroup"
	colspan={columnSpan}
	data-slot="operational-matrix-column-group"
	data-matrix-column-header
	data-sticky-axis={sticky ? 'block-start' : undefined}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		{label}
	{/if}
</th>
