<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Spinner } from '$lib/components/ui/spinner';

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

<AppDialog.Root open closeBlocked={saving} {onClose}>
	<AppDialog.Content closeBlocked={saving}>
		<AppDialog.Header>
			<AppDialog.Title>Transfer Ownership</AppDialog.Title>
		</AppDialog.Header>
		<AppDialog.Body class="flex flex-col gap-4">
			<div class="warning-box">
				<strong>Irreversible action</strong>
				<p>The current owner will be demoted to admin as soon as the transfer completes.</p>
			</div>

			<div class="grid gap-2">
				<Label for="new-owner">New Owner</Label>
				<NativeSelect id="new-owner" bind:value={selectedUserId} disabled={saving}>
					<option value="">Select a member...</option>
					{#each eligibleMembers as member (member.userId)}
						<option value={member.userId}>{member.email} ({member.role})</option>
					{/each}
				</NativeSelect>
			</div>

			<div class="grid gap-2">
				<Label for="confirm-name">Type {orgName} to confirm</Label>
				<Input
					id="confirm-name"
					type="text"
					bind:value={confirmName}
					placeholder={orgName}
					disabled={saving}
					autocomplete="off"
				/>
			</div>

			{#if errorMsg}
				<p class="text-error error-msg">{errorMsg}</p>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
			<Button variant="destructive" onclick={handleTransfer} disabled={!canConfirm}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Transferring...' : 'Transfer Ownership'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<style>
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
