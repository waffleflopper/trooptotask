<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableSectionElement> & {
		children?: Snippet;
	};

	let { children, ...restProps }: Props = $props();
</script>

<tbody data-slot="operational-matrix-body" data-matrix-body {...restProps}>
	{@render children?.()}
</tbody>
