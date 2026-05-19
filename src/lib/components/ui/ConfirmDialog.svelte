<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: 'destructive' | 'danger' | 'warning' | 'primary' | 'secondary';
		disabled?: boolean;
		loading?: boolean;
		onConfirm: () => void | Promise<void>;
		onCancel: () => void;
	}

	let {
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'destructive',
		disabled = false,
		loading = false,
		onConfirm,
		onCancel
	}: Props = $props();

	let confirming = $state(false);
	const busy = $derived(confirming || loading);
	const confirmDisabled = $derived(disabled || busy);
	const confirmVariant = $derived(
		variant === 'secondary'
			? 'secondary'
			: variant === 'warning'
				? 'default'
				: variant === 'primary'
					? 'default'
					: 'destructive'
	);

	async function handleConfirm() {
		if (confirmDisabled) return;
		confirming = true;
		try {
			await onConfirm();
		} finally {
			confirming = false;
		}
	}
</script>

<AlertDialog.Root open onOpenChange={(open) => !open && !busy && onCancel()}>
	<AlertDialog.Content
		escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		interactOutsideBehavior={busy ? 'ignore' : 'close'}
		restoreScrollDelay={0}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{message}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={onCancel} disabled={busy}>{cancelLabel}</Button>
			<Button variant={confirmVariant} onclick={handleConfirm} disabled={confirmDisabled}>
				{#if busy}<Spinner />{/if}
				{confirmLabel}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
