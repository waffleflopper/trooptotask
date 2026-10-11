<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
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

<Collapsible.Root bind:open onOpenChange={handleOpenChange} data-slot="onboarding-packet-notes" class="contents">
	<Collapsible.Trigger data-slot="onboarding-packet-notes-trigger" aria-label={label}>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="gap-1 px-1.5 text-muted-foreground">
				<MessageSquare aria-hidden="true" class="size-4" />
				{#if count > 0}
					<span class="font-mono text-xs font-semibold text-primary">{count}</span>
				{/if}
			</Button>
		{/snippet}
	</Collapsible.Trigger>
	<Collapsible.Content
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
	</Collapsible.Content>
</Collapsible.Root>
