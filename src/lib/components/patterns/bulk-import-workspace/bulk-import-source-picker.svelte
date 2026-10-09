<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		label?: string;
		children?: Snippet;
	};

	let { label = 'Import source', children, class: className, ...restProps }: Props = $props();
</script>

<div
	role="radiogroup"
	aria-label={label}
	data-slot="bulk-import-source-picker"
	class={cn('grid gap-2 sm:grid-cols-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
