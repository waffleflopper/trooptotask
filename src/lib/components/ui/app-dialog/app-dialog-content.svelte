<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Sheet from '$lib/components/ui/sheet';
	import { cn } from '$lib/utils';
	import { getAppDialogState } from './app-dialog-context';

	type DialogContentProps = ComponentProps<typeof Dialog.Content>;

	type Props = Omit<DialogContentProps, 'children' | 'size'> & {
		children?: Snippet;
		showCloseButton?: boolean;
		/** A sheet takes only `wide`, for a form whose side-by-side choices need the room. */
		size?: 'default' | 'wide' | 'fullscreen';
		/** A side sheet keeps the same dismissal and busy rules as the centered dialog. */
		presentation?: 'dialog' | 'sheet';
	};

	let {
		children,
		showCloseButton = true,
		size = 'default',
		presentation = 'dialog',
		class: className,
		ref = $bindable(null),
		...restProps
	}: Props = $props();

	const dialog = getAppDialogState();
	const primitiveSize = $derived(size === 'wide' || size === 'fullscreen' ? 'wide' : 'default');
</script>

{#if presentation === 'sheet'}
	<Sheet.Content
		bind:ref
		aria-busy={dialog.busy || undefined}
		showCloseButton={showCloseButton && !dialog.closeBlocked}
		escapeKeydownBehavior={dialog.closeBlocked ? 'ignore' : 'close'}
		interactOutsideBehavior={dialog.closeBlocked ? 'ignore' : 'close'}
		restoreScrollDelay={0}
		class={cn(
			'w-full gap-0 sm:max-w-md [&>[data-slot=app-dialog-body]]:flex-1',
			size === 'wide' && 'data-[side=right]:w-full data-[side=right]:sm:max-w-140',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</Sheet.Content>
{:else}
	<Dialog.Content
		bind:ref
		aria-busy={dialog.busy || undefined}
		size={primitiveSize}
		showCloseButton={showCloseButton && !dialog.closeBlocked}
		escapeKeydownBehavior={dialog.closeBlocked ? 'ignore' : 'close'}
		interactOutsideBehavior={dialog.closeBlocked ? 'ignore' : 'close'}
		restoreScrollDelay={0}
		class={cn(
			'max-h-[min(42rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg',
			size === 'wide' && 'sm:max-w-3xl',
			size === 'fullscreen' && 'h-[calc(100dvh-2rem)] sm:max-w-5xl',
			dialog.tone === 'destructive' && 'border-t-4 border-t-destructive',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</Dialog.Content>
{/if}
