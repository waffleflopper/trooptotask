<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { redirectToSensitiveActionStepUp } from '$lib/auth/sensitiveActionStepUp';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import DangerZoneSettingsSection from '../DangerZoneSettingsSection.svelte';
	import { createSettingsWorkspaceState } from '../settingsWorkspaceState.svelte';

	let { data, form } = $props();

	let deleteLoading = $state(false);
	let transferLoading = $state(false);
	const settingsState = createSettingsWorkspaceState(() => data.workspace);
	const organizationSection = $derived(data.workspace.sections.organization);
	const dangerZoneSection = $derived(settingsState.dangerZone.section);
	const currentMember = $derived(data.workspace.currentMember);

	const transferEnhance: SubmitFunction = () => {
		transferLoading = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
				await update();
				if (result.type === 'success') settingsState.dangerZone.closeTransferConfirmation();
			} finally {
				transferLoading = false;
			}
		};
	};

	function closeDeleteOrganizationDialog() {
		settingsState.dangerZone.closeDeleteConfirmation();
	}
</script>

{#if currentMember.isOwner}
	<DangerZoneSettingsSection
		orgName={organizationSection.name}
		{form}
		section={dangerZoneSection}
		bind:transferTargetId={settingsState.dangerZone.transferTargetId}
		onTransferConfirm={() => settingsState.dangerZone.openTransferConfirmation()}
		onDeleteConfirm={() => settingsState.dangerZone.openDeleteConfirmation()}
	/>
{:else}
	<div class="rounded-lg border bg-card p-4 text-card-foreground">
		<h2 class="font-medium">Owner access required</h2>
		<p class="text-sm text-muted-foreground">
			Only the organization owner can transfer ownership or delete the organization.
		</p>
	</div>
{/if}

{#if settingsState.dangerZone.showDeleteConfirm}
	<AppDialog.Root
		bind:open={settingsState.dangerZone.showDeleteConfirm}
		closeBlocked={deleteLoading || settingsState.dangerZone.deleteOrganizationCloseBlocked}
		onClose={closeDeleteOrganizationDialog}
	>
		<AppDialog.Content closeBlocked={deleteLoading || settingsState.dangerZone.deleteOrganizationCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Delete Organization</AppDialog.Title>
				<AppDialog.Description>
					This will permanently delete {organizationSection.name} and all associated data. This action cannot be undone.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
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
						if (!settingsState.dangerZone.deleteConfirmMatches) event.preventDefault();
					}}
				>
					<Label for="confirmDelete">Type {organizationSection.name} to confirm</Label>
					<Input
						id="confirmDelete"
						name="confirmName"
						type="text"
						bind:value={settingsState.dangerZone.deleteConfirmText}
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
					disabled={deleteLoading || !settingsState.dangerZone.deleteConfirmMatches}
				>
					{deleteLoading ? 'Deleting...' : 'Delete Permanently'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if settingsState.dangerZone.showTransferConfirm && settingsState.dangerZone.transferTargetId}
	<AppDialog.Root
		bind:open={settingsState.dangerZone.showTransferConfirm}
		closeBlocked={transferLoading || settingsState.dangerZone.transferCloseBlocked}
		onClose={() => settingsState.dangerZone.closeTransferConfirmation()}
	>
		<AppDialog.Content closeBlocked={transferLoading || settingsState.dangerZone.transferCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Transfer Ownership</AppDialog.Title>
				<AppDialog.Description>
					Transfer owner authority to {settingsState.dangerZone.selectedTransferCandidate?.email ??
						'the selected member'}.
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
					<input type="hidden" name="newOwnerId" value={settingsState.dangerZone.transferTargetId} />
					<Label for="confirmTransferOwner">Type the member email to confirm</Label>
					<Input
						id="confirmTransferOwner"
						name="confirmTransferEmail"
						type="text"
						bind:value={settingsState.dangerZone.transferConfirmText}
						placeholder={settingsState.dangerZone.selectedTransferCandidate?.email ?? 'member@example.com'}
						autocomplete="off"
					/>
				</form>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={transferLoading}
					onclick={() => settingsState.dangerZone.closeTransferConfirmation()}>Cancel</Button
				>
				<Button
					type="submit"
					form="transfer-ownership-form"
					variant="destructive"
					disabled={transferLoading || !settingsState.dangerZone.transferConfirmMatches}
				>
					{transferLoading ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
