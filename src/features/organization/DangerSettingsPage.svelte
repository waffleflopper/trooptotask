<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import type { DangerSettingsData } from './dangerSettingsTypes';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import { createOwnershipTransferWorkspace } from './ownershipTransferWorkspace.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { settleAction } from '$lib/utils/settleAction';
	import DangerZoneSettingsSection from './DangerZoneSettingsSection.svelte';
	import { createSettingsDangerZoneState } from './dangerSettingsState.svelte';

	let { settings, form }: { settings: DangerSettingsData; form: Record<string, unknown> | null } = $props();
	let active = true;
	onDestroy(() => {
		active = false;
	});

	let deleteLoading = $state(false);
	let transferLoading = $state(false);
	let deleteRequestError = $state<string | null>(null);
	let transferRequestError = $state<string | null>(null);
	let deleteButton = $state<HTMLButtonElement | null>(null);
	let transferButton = $state<HTMLButtonElement | null>(null);
	const dangerZoneState = createSettingsDangerZoneState(() => settings);
	const transferState = createOwnershipTransferWorkspace(
		() => settings.sections.dangerZone.transferOwnershipCandidates
	);
	const organizationSection = $derived(settings.sections.organization);
	const dangerZoneSection = $derived(dangerZoneState.section);
	const currentMember = $derived(settings.currentMember);

	const transferEnhance: SubmitFunction = () => {
		transferLoading = true;
		transferRequestError = null;
		return async (outcome) => {
			if (!active) return;
			const { result } = outcome;
			if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
				transferLoading = false;
				return;
			}
			const error = await settleAction(outcome, {
				focus: () => [transferButton],
				settled: () => {
					if (!active) return;
					transferLoading = false;
					if (result.type === 'success') transferState.closeTransferConfirmation();
				}
			});
			if (active) transferRequestError = error;
		};
	};

	const deleteEnhance: SubmitFunction = () => {
		deleteLoading = true;
		deleteRequestError = null;
		return async (outcome) => {
			if (!active) return;
			const { result } = outcome;
			if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
				deleteLoading = false;
				return;
			}
			const error = await settleAction(outcome, {
				focus: () => [deleteButton],
				settled: () => {
					if (active) deleteLoading = false;
				}
			});
			if (active) deleteRequestError = error;
		};
	};

	function closeDeleteOrganizationDialog() {
		deleteRequestError = null;
		dangerZoneState.closeDeleteConfirmation();
	}

	function closeTransferDialog() {
		transferRequestError = null;
		transferState.closeTransferConfirmation();
	}
</script>

{#if currentMember.isOwner}
	<DangerZoneSettingsSection
		orgName={organizationSection.name}
		{form}
		section={dangerZoneSection}
		bind:transferTargetId={transferState.transferTargetId}
		onTransferConfirm={() => transferState.openTransferConfirmation()}
		onDeleteConfirm={() => dangerZoneState.openDeleteConfirmation()}
	/>
{:else}
	<div class="rounded-lg border bg-card p-4 text-card-foreground">
		<h2 class="font-medium">Owner access required</h2>
		<p class="text-sm text-muted-foreground">
			Only the organization owner can transfer ownership or delete the organization.
		</p>
	</div>
{/if}

{#if dangerZoneState.showDeleteConfirm}
	<AppDialog.Root
		bind:open={dangerZoneState.showDeleteConfirm}
		busy={deleteLoading}
		closeBlocked={dangerZoneState.deleteOrganizationCloseBlocked}
		onClose={closeDeleteOrganizationDialog}
	>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Delete Organization</AppDialog.Title>
				<AppDialog.Description>
					This will permanently delete {organizationSection.name} and its records and private files. Retained audit history
					stays for accountability. File removal cannot be undone, even if a later deletion step fails.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				{#if deleteRequestError || form?.deleteError}
					<Alert.Root variant="destructive">
						<Alert.Description>{deleteRequestError ?? form?.deleteError}</Alert.Description>
					</Alert.Root>
				{/if}
				<form
					id="delete-org-form"
					method="POST"
					action="?/deleteOrganization"
					class="grid gap-3"
					use:enhance={deleteEnhance}
					onsubmit={(event) => {
						if (!dangerZoneState.deleteConfirmMatches) event.preventDefault();
					}}
				>
					<Label for="confirmDelete">Type {organizationSection.name} to confirm</Label>
					<Input
						id="confirmDelete"
						name="confirmName"
						type="text"
						bind:value={dangerZoneState.deleteConfirmText}
						autocomplete="off"
					/>
				</form>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button type="button" variant="outline" disabled={deleteLoading} onclick={closeDeleteOrganizationDialog}
					>Cancel</Button
				>
				<Button
					bind:ref={deleteButton}
					type="submit"
					form="delete-org-form"
					variant="destructive"
					disabled={deleteLoading || !dangerZoneState.deleteConfirmMatches}
				>
					{deleteLoading ? 'Deleting...' : 'Delete Permanently'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if transferState.showTransferConfirm && transferState.transferTargetId}
	<AppDialog.Root
		bind:open={transferState.showTransferConfirm}
		busy={transferLoading}
		closeBlocked={transferState.transferCloseBlocked}
		onClose={closeTransferDialog}
	>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Transfer Ownership</AppDialog.Title>
				<AppDialog.Description>
					Transfer owner authority to {transferState.selectedTransferCandidate?.email ?? 'the selected member'}.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				{#if transferRequestError || form?.transferError}
					<Alert.Root variant="destructive">
						<Alert.Description>{transferRequestError ?? form?.transferError}</Alert.Description>
					</Alert.Root>
				{/if}
				<form
					id="transfer-ownership-form"
					method="POST"
					action="?/transferOwnership"
					class="grid gap-2"
					use:enhance={transferEnhance}
				>
					<input type="hidden" name="newOwnerId" value={transferState.transferTargetId} />
					<Label for="confirmTransferOwner">Type the member email to confirm</Label>
					<Input
						id="confirmTransferOwner"
						name="confirmTransferEmail"
						type="text"
						bind:value={transferState.transferConfirmText}
						placeholder={transferState.selectedTransferCandidate?.email ?? 'member@example.com'}
						autocomplete="off"
					/>
				</form>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button type="button" variant="outline" disabled={transferLoading} onclick={closeTransferDialog}>Cancel</Button>
				<Button
					bind:ref={transferButton}
					type="submit"
					form="transfer-ownership-form"
					variant="destructive"
					disabled={transferLoading || !transferState.transferConfirmMatches}
				>
					{transferLoading ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
