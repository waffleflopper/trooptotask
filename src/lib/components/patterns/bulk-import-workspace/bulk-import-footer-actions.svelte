<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		disabledReason?: string;
	};

	let { children, disabledReason, class: className, ...restProps }: Props = $props();
</script>

<div
	data-slot="bulk-import-footer-actions"
	class={cn(
		'flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end',
		className
	)}
	{...restProps}
>
	{#if disabledReason}
		<p role="status" class="mr-auto text-sm text-muted-foreground">{disabledReason}</p>
	{/if}
	{@render children?.()}
</div>
