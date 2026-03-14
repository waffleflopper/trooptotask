<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		type: 'user' | 'org';
		targetId: string;
		targetName: string;
		isSuspended: boolean;
		onClose: () => void;
		onComplete: () => void;
	}

	let { type, targetId, targetName, isSuspended, onClose, onComplete }: Props = $props();

	let reason = $state('');
	let saving = $state(false);
	let errorMsg = $state('');

	const action = $derived(isSuspended ? 'unsuspend' : 'suspend');
	const title = $derived(isSuspended ? `Unsuspend ${targetName}` : `Suspend ${targetName}`);

	async function handleAction() {
		if (saving) return;
		saving = true;
		errorMsg = '';
		try {
			const res = await fetch('/admin/api/suspend', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, targetId, action, reason: reason.trim() || undefined })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body?.message ?? 'An error occurred. Please try again.';
				return;
			}
			onComplete();
		} catch {
			errorMsg = 'Network error. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<Modal {title} {onClose} width="480px" canClose={!saving}>
	<div class="body">
		{#if isSuspended}
			<p>Are you sure you want to <strong>unsuspend</strong> <em>{targetName}</em>? They will regain access immediately.</p>
		{:else}
			<p>Are you sure you want to <strong>suspend</strong> <em>{targetName}</em>? They will lose access immediately.</p>
		{/if}

		<div class="form-group">
			<label for="reason" class="label">Reason (optional)</label>
			<textarea
				id="reason"
				class="input"
				rows={3}
				bind:value={reason}
				placeholder="Internal note about why this action was taken..."
				disabled={saving}
			></textarea>
		</div>

		{#if errorMsg}
			<p class="error-msg">{errorMsg}</p>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={onClose} disabled={saving}>Cancel</button>
		<button
			class="btn {isSuspended ? 'btn-primary' : 'btn-danger'}"
			onclick={handleAction}
			disabled={saving}
		>
			{#if saving}<Spinner />{/if}
			{saving ? 'Processing...' : isSuspended ? 'Unsuspend' : 'Suspend'}
		</button>
	{/snippet}
</Modal>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.body p {
		font-size: var(--font-size-base);
		color: var(--color-text);
		margin: 0;
	}

	textarea.input {
		resize: vertical;
		min-height: 72px;
	}

	.error-msg {
		color: var(--color-error);
		font-size: var(--font-size-sm);
		margin: 0;
	}
</style>
