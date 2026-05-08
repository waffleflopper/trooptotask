<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableRowElement> & {
		children?: Snippet;
	};

	let { children, ...restProps }: Props = $props();
</script>

<tr data-slot="operational-matrix-header-row" data-matrix-header-row {...restProps}>
	{@render children?.()}
</tr>
