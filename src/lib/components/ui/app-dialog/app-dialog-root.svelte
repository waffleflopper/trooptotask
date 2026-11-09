<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import * as Dialog from '$lib/components/ui/dialog';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import { setAppDialogState, type AppDialogTone, type AppDialogVoice } from './app-dialog-context';

	type Props = DialogPrimitive.RootProps & {
		/**
		 * Work is in flight: the dialog announces aria-busy and blocks dismissal. Once the Organization lifetime the
		 * dialog opened in ends, that work never settles here, so neither this nor `closeBlocked` holds it open.
		 */
		busy?: boolean;
		/** Dismissal would lose something (a draft, an unresolved outcome) without work being in flight. */
		closeBlocked?: boolean;
		onClose?: () => void;
		/** `destructive` marks a dialog that confirms an irreversible action. */
		tone?: AppDialogTone;
		voice?: AppDialogVoice;
		children?: Snippet;
	};

	let {
		open = $bindable(true),
		busy = false,
		closeBlocked = false,
		onClose,
		tone = 'default',
		voice = 'default',
		onOpenChange,
		children,
		...restProps
	}: Props = $props();

	const openedInLifetime = $derived.by(() => {
		void open;
		return untrack(stillInOrganizationLifetime);
	});
	const blocked = $derived((busy || closeBlocked) && openedInLifetime());

	setAppDialogState({
		get busy() {
			return busy;
		},
		get closeBlocked() {
			return blocked;
		},
		get tone() {
			return tone;
		},
		get voice() {
			return voice;
		}
	});

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && blocked) {
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
