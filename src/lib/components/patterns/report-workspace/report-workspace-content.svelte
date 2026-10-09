<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		layout?: 'stack' | 'split';
	};

	let { children, layout = 'stack', class: className, ...restProps }: Props = $props();
</script>

<div
	data-slot="report-workspace-content"
	data-layout={layout}
	class={cn('grid min-w-0 gap-4 data-[layout=split]:xl:grid-cols-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
