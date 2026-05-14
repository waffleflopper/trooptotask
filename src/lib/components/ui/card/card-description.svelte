<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLParagraphElement> & {
		children?: Snippet;
	};

	let { children, class: className, ...restProps }: Props = $props();
</script>

<p data-slot="card-description" class={cn('text-xs text-muted-foreground', className)} {...restProps}>
	{@render children?.()}
</p>
