<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import * as Dialog from '$lib/components/ui/dialog';

	type Props = DialogPrimitive.RootProps & {
		closeBlocked?: boolean;
		onClose?: () => void;
		children?: Snippet;
	};

	let { open = $bindable(true), closeBlocked = false, onClose, onOpenChange, children, ...restProps }: Props = $props();

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && closeBlocked) {
			open = true;
			return;
		}

		open = nextOpen;
		onOpenChange?.(nextOpen);

		if (!nextOpen) {
			onClose?.();
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange} {...restProps}>
	{@render children?.()}
</Dialog.Root>
