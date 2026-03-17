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

	// Exclude the current owner
	const eligibleMembers = $derived(members.filter((m) => m.role !== 'owner'));

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
	<div class="body">
		<p class="warning">
			<strong>Warning:</strong> This action is irreversible. The current owner will be demoted to admin.
		</p>

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
			<label for="confirm-name" class="label">
				Type <strong>{orgName}</strong> to confirm
			</label>
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
			<p class="error-msg">{errorMsg}</p>
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
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.warning {
		background: color-mix(in srgb, var(--color-warning) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		margin: 0;
	}

	.error-msg {
		color: var(--color-error);
		font-size: var(--font-size-sm);
		margin: 0;
	}
</style>
