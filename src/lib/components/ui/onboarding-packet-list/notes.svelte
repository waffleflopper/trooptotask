<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		count = 0,
		label = 'Toggle notes',
		emptyLabel = 'No notes yet.',
		children,
		readOnly = false,
		onOpenChange
	}: {
		open?: boolean;
		count?: number;
		label?: string;
		emptyLabel?: string;
		children?: Snippet;
		readOnly?: boolean;
		onOpenChange?: (open: boolean) => void;
	} = $props();

	function handleOpenChange(nextOpen: boolean) {
		open = nextOpen;
		onOpenChange?.(nextOpen);
	}
</script>

<CollapsiblePrimitive.Root
	bind:open
	onOpenChange={handleOpenChange}
	data-slot="onboarding-packet-notes"
	class="contents"
>
	<CollapsiblePrimitive.Trigger
		data-slot="onboarding-packet-notes-trigger"
		class="inline-flex items-center gap-1 rounded-md border border-border bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted data-[state=open]:text-foreground [&_svg]:size-4"
		aria-label={label}
	>
		<MessageSquare aria-hidden="true" class="size-4" />
		{#if count > 0}
			<span class="font-mono text-xs font-semibold text-primary">{count}</span>
		{/if}
	</CollapsiblePrimitive.Trigger>
	<CollapsiblePrimitive.Content
		data-slot="onboarding-packet-notes-content"
		class="mt-2 w-full rounded-lg border border-border bg-muted/35 p-3"
	>
		{#if children}
			<div class="flex max-h-56 flex-col gap-2 overflow-y-auto">
				{@render children()}
			</div>
		{/if}
		{#if count === 0 && !readOnly}
			<p class="m-0 text-sm text-muted-foreground">{emptyLabel}</p>
		{/if}
	</CollapsiblePrimitive.Content>
</CollapsiblePrimitive.Root>
