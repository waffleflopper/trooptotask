<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { Separator } from '$lib/components/ui/separator/index.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		title?: string;
		children?: Snippet;
		divided?: boolean;
	};

	let { title, children, divided = false, class: className, ...restProps }: Props = $props();
</script>

{#if divided}
	<Separator />
{/if}

<div data-slot="summary-rail-section" class={cn('grid gap-3', className)} {...restProps}>
	{#if title}
		<h4 class="font-semibold">{title}</h4>
	{/if}
	{@render children?.()}
</div>
