<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children?: Snippet;
	}

	let { class: className, children, ...restProps }: Props = $props();
</script>

<div
	data-slot="type-management-workspace-choice"
	class={cn('rounded-md border border-border/80 bg-muted/20 p-2.5', className)}
	{...restProps}
>
	{@render children?.()}
</div>
