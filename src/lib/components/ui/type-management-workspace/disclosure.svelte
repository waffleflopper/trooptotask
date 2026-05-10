<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	interface Props extends HTMLAttributes<HTMLDetailsElement> {
		title: string;
		description?: string;
		open?: boolean;
		children?: Snippet;
	}

	let { class: className, title, description, open = false, children, ...restProps }: Props = $props();
</script>

<details
	data-slot="type-management-workspace-disclosure"
	class={cn('group rounded-lg border border-border bg-card p-4', className)}
	{open}
	{...restProps}
>
	<summary
		data-slot="type-management-workspace-disclosure-summary"
		class="flex cursor-pointer list-none items-start justify-between gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
	>
		<span class="grid gap-1">
			<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</span>
			{#if description}
				<span class="text-sm text-muted-foreground">{description}</span>
			{/if}
		</span>
		<span class="text-sm text-muted-foreground group-open:hidden">Show</span>
		<span class="hidden text-sm text-muted-foreground group-open:inline">Hide</span>
	</summary>
	<div data-slot="type-management-workspace-disclosure-content" class="mt-4 grid gap-3">
		{@render children?.()}
	</div>
</details>
