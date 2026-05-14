<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
	import * as Field from '$lib/components/ui/field';
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
			<Alert.Root variant="warning">
				<Alert.Title>Irreversible action</Alert.Title>
				<Alert.Description
					>The current owner will be demoted to admin as soon as the transfer completes.</Alert.Description
				>
			</Alert.Root>

			<Field.Root>
				<Field.Label for="new-owner">New Owner</Field.Label>
				<Field.Control>
					<NativeSelect id="new-owner" bind:value={selectedUserId} disabled={saving}>
						<option value="">Select a member...</option>
						{#each eligibleMembers as member (member.userId)}
							<option value={member.userId}>{member.email} ({member.role})</option>
						{/each}
					</NativeSelect>
				</Field.Control>
			</Field.Root>

			<Field.Root>
				<Field.Label for="confirm-name">Type {orgName} to confirm</Field.Label>
				<Field.Control>
					<Input
						id="confirm-name"
						type="text"
						bind:value={confirmName}
						placeholder={orgName}
						disabled={saving}
						autocomplete="off"
					/>
				</Field.Control>
			</Field.Root>

			{#if errorMsg}
				<Alert.Root variant="destructive">
					<Alert.Description>{errorMsg}</Alert.Description>
				</Alert.Root>
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
