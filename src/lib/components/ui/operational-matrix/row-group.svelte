<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { OperationalMatrixRowGroup } from './types.js';

	type Props = HTMLAttributes<HTMLTableRowElement> & {
		group: OperationalMatrixRowGroup;
		columnSpan?: number;
		children?: Snippet;
		virtualIndex?: number;
	};

	let { group, columnSpan, children, virtualIndex, ...restProps }: Props = $props();
</script>

<tr
	data-slot="operational-matrix-row-group"
	data-matrix-row-group
	data-row-group-id={group.id}
	data-collapsed={group.collapsed || undefined}
	aria-rowindex={virtualIndex}
	{...restProps}
>
	<th scope="rowgroup" colspan={columnSpan}>
		{#if children}
			{@render children()}
		{:else}
			{group.label}
		{/if}
	</th>
</tr>
