<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		ref?: HTMLDivElement | null;
		children?: Snippet;
	};

	let { ref = $bindable(null), children, class: className, ...restProps }: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	class={cn('rounded-md border bg-card text-card-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</div>
