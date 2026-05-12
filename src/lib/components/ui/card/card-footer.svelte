<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
	};

	let { children, class: className, ...restProps }: Props = $props();
</script>

<div data-slot="card-footer" class={cn('flex items-center border-t px-4 py-3', className)} {...restProps}>
	{@render children?.()}
</div>
