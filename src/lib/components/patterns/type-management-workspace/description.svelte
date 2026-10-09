<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	interface Props extends HTMLAttributes<HTMLParagraphElement> {
		children?: Snippet;
	}

	let { class: className, children, ...restProps }: Props = $props();
</script>

<p
	data-slot="type-management-workspace-description"
	class={cn('text-sm leading-relaxed text-muted-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</p>
