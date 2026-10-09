<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';
	import { getAppDialogState } from './app-dialog-context';

	type DialogContentProps = ComponentProps<typeof Dialog.Content>;

	type Props = Omit<DialogContentProps, 'children' | 'size'> & {
		children?: Snippet;
		showCloseButton?: boolean;
		size?: 'default' | 'wide' | 'fullscreen';
	};

	let {
		children,
		showCloseButton = true,
		size = 'default',
		class: className,
		ref = $bindable(null),
		...restProps
	}: Props = $props();

	const dialog = getAppDialogState();
	const primitiveSize = $derived(size === 'wide' || size === 'fullscreen' ? 'wide' : 'default');
</script>

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
		className
	)}
	{...restProps}
>
	{@render children?.()}
</Dialog.Content>
