<script lang="ts">
	import { deserialize } from '$app/forms';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
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
		onComplete: (orgId: string, targetUserId: string) => void | Promise<void>;
		onReload: (orgId: string, targetUserId: string) => Promise<{ ownerUserId: string; targetIsEligible: boolean }>;
	}

	let { orgId, orgName, members, onClose, onComplete, onReload }: Props = $props();

	let selectedUserId = $state('');
	let confirmName = $state('');
	let saving = $state(false);
	let errorMsg = $state('');
	let saved = $state(false);
	let uncertain = $state<{ orgId: string; targetUserId: string; ownerUserId: string | null } | null>(null);
	let reloading = $state(false);
	let stale = $state(false);

	const eligibleMembers = $derived(members.filter((member) => member.role === 'member' || member.role === 'admin'));
	const canConfirm = $derived(
		selectedUserId !== '' && confirmName === orgName && !saving && !saved && !uncertain && !reloading && !stale
	);

	async function handleTransfer() {
		if (!canConfirm) return;
		const mutationOrgId = orgId;
		const mutationTargetId = selectedUserId;
		const complete = onComplete;
		const owners = members.filter((member) => member.role === 'owner');
		const command = {
			orgId: mutationOrgId,
			targetUserId: mutationTargetId,
			ownerUserId: owners.length === 1 ? owners[0].userId : null
		};
		saving = true;
		errorMsg = '';
		try {
			const formData = new FormData();
			formData.set('targetUserId', selectedUserId);
			formData.set('confirmName', confirmName);

			const res = await fetch(`/admin/organizations/${orgId}?/transferOwnership`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'x-sveltekit-action': 'true' },
				body: formData
			});

			const result = deserialize(await res.text());
			if (orgId !== mutationOrgId) return;
			if (result.type === 'failure') {
				if (redirectToSensitiveActionStepUp(result.data)) return;
				const failure = result.data?.error;
				errorMsg =
					typeof failure === 'object' && failure && 'message' in failure && typeof failure.message === 'string'
						? failure.message
						: 'Transfer could not be confirmed. Reload this page before trying again.';
				if (
					res.status >= 500 ||
					![400, 403, 404, 409].includes(result.status) ||
					typeof failure !== 'object' ||
					!failure ||
					!('message' in failure) ||
					typeof failure.message !== 'string'
				) {
					uncertain = command;
				}
				return;
			}
			if (!res.ok || result.type !== 'success' || result.data?.success !== true) {
				uncertain = command;
				errorMsg = 'Transfer could not be confirmed. Reload this page before trying again.';
				return;
			}
			saved = true;
			try {
				await complete(mutationOrgId, mutationTargetId);
			} catch {
				errorMsg = 'Transferred, but the details could not be refreshed. Reload this page to see the current owner.';
			}
		} catch {
			if (orgId !== mutationOrgId) return;
			uncertain = command;
			errorMsg = 'Transfer could not be confirmed. Reload this page before trying again.';
		} finally {
			saving = false;
		}
	}

	async function reloadDetails() {
		if (!uncertain || reloading) return;
		const command = uncertain;
		const reload = onReload;
		reloading = true;
		try {
			const current = await reload(command.orgId, command.targetUserId);
			if (orgId !== command.orgId) return;
			if (!current.ownerUserId || typeof current.targetIsEligible !== 'boolean')
				throw new Error('Ownership state unavailable');
			if (current.ownerUserId === command.targetUserId) {
				onClose();
			} else if (current.ownerUserId === command.ownerUserId && current.targetIsEligible) {
				uncertain = null;
				errorMsg = 'Details refreshed. Review the current owner and confirm again if needed.';
			} else {
				uncertain = null;
				stale = true;
				errorMsg =
					'Ownership or membership has changed. Close this dialog and review the current details before starting a new transfer.';
			}
		} catch {
			if (orgId === command.orgId) errorMsg = 'Details could not be refreshed. Reload details before trying again.';
		} finally {
			reloading = false;
		}
	}
</script>

<AppDialog.Root open busy={saving || reloading} closeBlocked={saved || !!uncertain} {onClose}>
	<AppDialog.Content>
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
					<NativeSelect
						id="new-owner"
						bind:value={selectedUserId}
						disabled={saving || saved || !!uncertain || reloading || stale}
					>
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
						disabled={saving || saved || !!uncertain || reloading || stale}
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
			{#if saved}
				<Button onclick={() => window.location.reload()}>Reload details</Button>
			{:else if uncertain}
				<Button
					onclick={reloadDetails}
					aria-disabled={reloading ? 'true' : undefined}
					aria-busy={reloading || undefined}
				>
					{#if reloading}<Spinner />{/if}
					Reload details
				</Button>
			{:else if stale}
				<Button variant="outline" onclick={onClose}>Close and review</Button>
			{:else}
				<Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
				<Button
					variant="destructive"
					onclick={handleTransfer}
					disabled={!saving && !canConfirm}
					aria-disabled={saving ? 'true' : undefined}
					aria-busy={saving || undefined}
				>
					{#if saving}<Spinner />{/if}
					{saving ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
