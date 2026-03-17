<script lang="ts">
	import Modal from '../Modal.svelte';
	import Spinner from './Spinner.svelte';

	interface Props {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: 'danger' | 'warning';
		onConfirm: () => void | Promise<void>;
		onCancel: () => void;
	}

	let {
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'danger',
		onConfirm,
		onCancel
	}: Props = $props();

	let confirming = $state(false);

	async function handleConfirm() {
		if (confirming) return;
		confirming = true;
		try {
			await onConfirm();
		} finally {
			confirming = false;
		}
	}
</script>

<Modal {title} onClose={onCancel} width="420px" titleId="confirm-dialog-title" canClose={!confirming}>
	<p class="confirm-message">{message}</p>

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onCancel} disabled={confirming}>{cancelLabel}</button>
		<button
			class="btn {variant === 'danger' ? 'btn-danger' : 'btn-warning'}"
			onclick={handleConfirm}
			disabled={confirming}
		>
			{#if confirming}<Spinner />{/if}
			{confirmLabel}
		</button>
	{/snippet}
</Modal>

<style>
	.confirm-message {
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.btn-warning {
		background-color: var(--color-warning);
		color: white;
		box-shadow: var(--shadow-1);
	}

	.btn-warning:hover {
		background-color: #e68900;
		box-shadow: var(--shadow-2);
	}
</style>
