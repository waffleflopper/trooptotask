<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** A third choice between Cancel and Confirm, such as "Discard and open". It does not close on its own. */
		alternateLabel?: string;
		onAlternate?: () => void | Promise<void>;
		variant?: 'destructive' | 'default' | 'secondary';
		disabled?: boolean;
		loading?: boolean;
		onConfirm: () => void | Promise<void>;
		onCancel: () => void;
		children?: Snippet;
	}

	let {
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		alternateLabel,
		onAlternate,
		variant = 'destructive',
		disabled = false,
		loading = false,
		onConfirm,
		onCancel,
		children
	}: Props = $props();

	let confirming = $state(false);
	const busy = $derived(confirming || loading);
	const confirmDisabled = $derived(disabled || busy);

	async function run(action: () => void | Promise<void>) {
		if (confirmDisabled) return;
		confirming = true;
		try {
			await action();
		} finally {
			confirming = false;
		}
	}
</script>

<AlertDialog.Root open onOpenChange={(open) => !open && !busy && onCancel()}>
	<AlertDialog.Content
		aria-busy={busy || undefined}
		escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		restoreScrollDelay={0}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{message}</AlertDialog.Description>
		</AlertDialog.Header>
		{#if children}
			{@render children()}
		{/if}
		<AlertDialog.Footer>
			<Button variant="outline" onclick={onCancel} disabled={busy}>{cancelLabel}</Button>
			{#if alternateLabel && onAlternate}
				<Button variant="outline" onclick={() => run(onAlternate)} disabled={confirmDisabled}>{alternateLabel}</Button>
			{/if}
			<Button {variant} onclick={() => run(onConfirm)} disabled={confirmDisabled}>
				{#if busy}<Spinner />{/if}
				{confirmLabel}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
