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
	class={cn('rounded-lg border border-border bg-background p-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
