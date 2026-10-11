<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { cn } from '$lib/utils.js';

	interface Props {
		class?: string;
		title: string;
		description?: string;
		open?: boolean;
		children?: Snippet;
	}

	let { class: className, title, description, open = false, children }: Props = $props();
</script>

<Collapsible.Root
	{open}
	data-slot="type-management-workspace-disclosure"
	class={cn('rounded-md border border-border bg-muted/20 p-3', className)}
>
	<Collapsible.Trigger
		data-slot="type-management-workspace-disclosure-summary"
		class="group flex w-full cursor-pointer items-start justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<span class="grid gap-1">
			<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</span>
			{#if description}
				<span class="text-sm text-muted-foreground">{description}</span>
			{/if}
		</span>
		<span class="text-sm text-muted-foreground group-data-[state=open]:hidden">Show</span>
		<span class="hidden text-sm text-muted-foreground group-data-[state=open]:inline">Hide</span>
	</Collapsible.Trigger>
	<Collapsible.Content data-slot="type-management-workspace-disclosure-content" class="mt-4 grid gap-3">
		{@render children?.()}
	</Collapsible.Content>
</Collapsible.Root>
