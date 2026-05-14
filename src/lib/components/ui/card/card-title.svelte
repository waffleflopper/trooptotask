<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLHeadingElement> & {
		children?: Snippet;
	};

	let { children, class: className, ...restProps }: Props = $props();
</script>

<h3 data-slot="card-title" class={cn('text-sm font-semibold leading-none tracking-tight', className)} {...restProps}>
	{@render children?.()}
</h3>
