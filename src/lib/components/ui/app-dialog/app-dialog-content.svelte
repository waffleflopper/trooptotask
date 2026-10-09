<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';

	type DialogContentProps = ComponentProps<typeof Dialog.Content>;

	type Props = Omit<DialogContentProps, 'children' | 'size'> & {
		children?: Snippet;
		closeBlocked?: boolean;
		showCloseButton?: boolean;
		size?: 'default' | 'wide' | 'fullscreen';
	};

	let {
		children,
		closeBlocked = false,
		showCloseButton = true,
		size = 'default',
		class: className,
		ref = $bindable(null),
		...restProps
	}: Props = $props();

	// A busy dialog disables its own controls; keep focus in the dialog instead of letting it fall to the page.
	$effect(() => {
		if (!closeBlocked || !ref) return;
		const active = document.activeElement;
		if (active === document.body || (ref.contains(active) && active?.matches(':disabled'))) ref.focus();
	});

	const primitiveSize = $derived(size === 'wide' || size === 'fullscreen' ? 'wide' : 'default');
</script>

<Dialog.Content
	bind:ref
	tabindex={-1}
	aria-busy={closeBlocked || undefined}
	size={primitiveSize}
	showCloseButton={showCloseButton && !closeBlocked}
	escapeKeydownBehavior={closeBlocked ? 'ignore' : 'close'}
	interactOutsideBehavior={closeBlocked ? 'ignore' : 'close'}
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
