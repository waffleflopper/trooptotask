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
	<div class="modal-stack">
		<p class="admin-note">
			{#if isSuspended}
				This {type === 'org' ? 'organization' : 'user'} will regain access immediately after you confirm.
			{:else}
				This {type === 'org' ? 'organization' : 'user'} will lose access immediately after you confirm.
			{/if}
		</p>

		<div class="admin-callout">
			<strong>{isSuspended ? 'Unsuspend' : 'Suspend'} target</strong>
			<p>{targetName}</p>
		</div>

		<div class="form-group">
			<label for="reason" class="label">Reason (optional)</label>
			<textarea
				id="reason"
				class="input modal-textarea"
				rows={3}
				bind:value={reason}
				placeholder="Internal note about why this action was taken..."
				disabled={saving}
			></textarea>
		</div>

		{#if errorMsg}
			<p class="text-error modal-error">{errorMsg}</p>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={onClose} disabled={saving}>Cancel</button>
		<button class="btn {isSuspended ? 'btn-primary' : 'btn-danger'}" onclick={handleAction} disabled={saving}>
			{#if saving}<Spinner />{/if}
			{saving ? 'Processing...' : isSuspended ? 'Unsuspend' : 'Suspend'}
		</button>
	{/snippet}
</Modal>

<style>
	.modal-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.admin-note,
	.admin-callout p,
	.modal-error {
		margin: 0;
	}

	.admin-note {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.admin-callout {
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
	}

	.admin-callout strong {
		display: block;
		margin-bottom: var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.modal-textarea {
		min-height: 88px;
		resize: vertical;
	}
</style>
