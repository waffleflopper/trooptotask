<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import * as Dialog from '$lib/components/ui/dialog';
	import { setAppDialogState } from './app-dialog-context';

	type Props = DialogPrimitive.RootProps & {
		/** Work is in flight: the dialog announces aria-busy and blocks dismissal. */
		busy?: boolean;
		/** Dismissal would lose something (a draft, an unresolved outcome) without work being in flight. */
		closeBlocked?: boolean;
		onClose?: () => void;
		children?: Snippet;
	};

	let {
		open = $bindable(true),
		busy = false,
		closeBlocked = false,
		onClose,
		onOpenChange,
		children,
		...restProps
	}: Props = $props();

	setAppDialogState({
		get busy() {
			return busy;
		},
		get closeBlocked() {
			return busy || closeBlocked;
		}
	});

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && (busy || closeBlocked)) {
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
