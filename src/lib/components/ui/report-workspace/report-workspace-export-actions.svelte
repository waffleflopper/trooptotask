<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		label?: string;
	};

	let { children, label = 'Report export actions', class: className, ...restProps }: Props = $props();
</script>

<div
	role="group"
	aria-label={label}
	data-slot="report-workspace-export-actions"
	class={cn('flex flex-wrap items-center gap-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
