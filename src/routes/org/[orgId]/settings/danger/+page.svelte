<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import { createOwnershipTransferWorkspace } from '$features/organization';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import DangerZoneSettingsSection from '../DangerZoneSettingsSection.svelte';
	import { createSettingsDangerZoneState } from '../settingsWorkspaceState.svelte';

	let { data, form }: PageProps = $props();

	let deleteLoading = $state(false);
	let transferLoading = $state(false);
	const dangerZoneState = createSettingsDangerZoneState(() => data.dangerSettings);
	const transferState = createOwnershipTransferWorkspace(
		() => data.dangerSettings.sections.dangerZone.transferOwnershipCandidates
	);
	const organizationSection = $derived(data.dangerSettings.sections.organization);
	const dangerZoneSection = $derived(dangerZoneState.section);
	const currentMember = $derived(data.dangerSettings.currentMember);

	const transferEnhance: SubmitFunction = () => {
		transferLoading = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
				await update();
				if (result.type === 'success') transferState.closeTransferConfirmation();
			} finally {
				transferLoading = false;
			}
		};
	};

	function closeDeleteOrganizationDialog() {
		dangerZoneState.closeDeleteConfirmation();
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
		closeBlocked={deleteLoading || dangerZoneState.deleteOrganizationCloseBlocked}
		onClose={closeDeleteOrganizationDialog}
	>
		<AppDialog.Content closeBlocked={deleteLoading || dangerZoneState.deleteOrganizationCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Delete Organization</AppDialog.Title>
				<AppDialog.Description>
					This will permanently delete {organizationSection.name} and all associated data. This action cannot be undone.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				{#if form?.deleteError}
					<Alert.Root variant="destructive">
						<Alert.Description>{form.deleteError}</Alert.Description>
					</Alert.Root>
				{/if}
				<form
					id="delete-org-form"
					method="POST"
					action="?/deleteOrganization"
					class="grid gap-3"
					use:enhance={() => {
						deleteLoading = true;
						return async ({ result, update }) => {
							try {
								if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
								await update();
							} finally {
								deleteLoading = false;
							}
						};
					}}
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
		closeBlocked={transferLoading || transferState.transferCloseBlocked}
		onClose={() => transferState.closeTransferConfirmation()}
	>
		<AppDialog.Content closeBlocked={transferLoading || transferState.transferCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Transfer Ownership</AppDialog.Title>
				<AppDialog.Description>
					Transfer owner authority to {transferState.selectedTransferCandidate?.email ?? 'the selected member'}.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				{#if form?.transferError}<p class="text-sm text-destructive">{form.transferError}</p>{/if}
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
				<Button
					type="button"
					variant="outline"
					disabled={transferLoading}
					onclick={() => transferState.closeTransferConfirmation()}>Cancel</Button
				>
				<Button
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
