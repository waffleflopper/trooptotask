<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Member {
		userId: string;
		email: string;
		role: string;
	}

	interface Props {
		orgId: string;
		orgName: string;
		members: Member[];
		onClose: () => void;
		onComplete: () => void;
	}

	let { orgId, orgName, members, onClose, onComplete }: Props = $props();

	let selectedUserId = $state('');
	let confirmName = $state('');
	let saving = $state(false);
	let errorMsg = $state('');

	const eligibleMembers = $derived(members.filter((member) => member.role !== 'owner'));
	const canConfirm = $derived(selectedUserId !== '' && confirmName.trim() === orgName && !saving);

	async function handleTransfer() {
		if (!canConfirm) return;
		saving = true;
		errorMsg = '';
		try {
			const formData = new FormData();
			formData.set('targetUserId', selectedUserId);
			formData.set('confirmName', confirmName);

			const res = await fetch(`/admin/organizations/${orgId}?/transferOwnership`, {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body?.error?.message ?? 'Transfer failed. Please try again.';
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

<Modal title="Transfer Ownership" {onClose} width="500px" canClose={!saving}>
	<div class="modal-stack">
		<div class="warning-box">
			<strong>Irreversible action</strong>
			<p>The current owner will be demoted to admin as soon as the transfer completes.</p>
		</div>

		<div class="form-group">
			<label for="new-owner" class="label">New Owner</label>
			<select id="new-owner" class="select" bind:value={selectedUserId} disabled={saving}>
				<option value="">Select a member...</option>
				{#each eligibleMembers as member (member.userId)}
					<option value={member.userId}>{member.email} ({member.role})</option>
				{/each}
			</select>
		</div>

		<div class="form-group">
			<label for="confirm-name" class="label">Type {orgName} to confirm</label>
			<input
				id="confirm-name"
				type="text"
				class="input"
				bind:value={confirmName}
				placeholder={orgName}
				disabled={saving}
				autocomplete="off"
			/>
		</div>

		{#if errorMsg}
			<p class="text-error error-msg">{errorMsg}</p>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={onClose} disabled={saving}>Cancel</button>
		<button class="btn btn-danger" onclick={handleTransfer} disabled={!canConfirm}>
			{#if saving}<Spinner />{/if}
			{saving ? 'Transferring...' : 'Transfer Ownership'}
		</button>
	{/snippet}
</Modal>

<style>
	.modal-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.warning-box {
		padding: var(--sp-4);
		border: 1px solid color-mix(in srgb, var(--amber-dark) 36%, var(--ink-15) 64%);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
	}

	.warning-box strong,
	.warning-box p,
	.error-msg {
		margin: 0;
	}

	.warning-box strong {
		display: block;
		margin-bottom: var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.warning-box p {
		font-size: var(--text-sm);
		line-height: 1.6;
	}
</style>
