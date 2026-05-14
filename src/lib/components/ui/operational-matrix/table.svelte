<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLTableElement> & {
		ariaLabel: string;
		children?: Snippet;
	};

	let { ariaLabel, children, class: className, ...restProps }: Props = $props();
</script>

<table
	aria-label={ariaLabel}
	data-slot="operational-matrix-table"
	data-matrix-table
	class={cn('w-full border-collapse', className)}
	{...restProps}
>
	{@render children?.()}
</table>
