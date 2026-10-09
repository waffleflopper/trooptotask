<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children?: Snippet;
	}

	let { class: className, children, ...restProps }: Props = $props();
</script>

<div data-slot="type-management-workspace-choice-group" class={cn('flex flex-wrap gap-2', className)} {...restProps}>
	{@render children?.()}
</div>
