<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableSectionElement> & {
		children?: Snippet;
		sticky?: boolean;
	};

	let { children, sticky = false, ...restProps }: Props = $props();
</script>

<thead
	data-slot="operational-matrix-header"
	data-matrix-header
	data-sticky-axis={sticky ? 'block-start' : undefined}
	{...restProps}
>
	{@render children?.()}
</thead>
