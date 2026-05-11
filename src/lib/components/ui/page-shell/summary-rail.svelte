<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { Separator } from '$lib/components/ui/separator/index.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		children?: Snippet;
	};

	let { title, children, class: className, ...restProps }: Props = $props();
</script>

<aside
	data-slot="summary-rail"
	aria-label={title}
	class={cn('grid min-w-0 content-start gap-4 rounded-lg border bg-card p-4 text-card-foreground', className)}
	{...restProps}
>
	<h3 class="text-lg font-semibold">{title}</h3>
	<Separator />
	{@render children?.()}
</aside>
