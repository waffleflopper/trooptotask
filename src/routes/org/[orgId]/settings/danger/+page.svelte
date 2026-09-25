<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import DangerZoneSettingsSection from '../DangerZoneSettingsSection.svelte';
	import { createSettingsDangerZoneState } from '../settingsWorkspaceState.svelte';

	let { data, form }: PageProps = $props();

	let deleteLoading = $state(false);
	let transferLoading = $state(false);
	const dangerZoneState = createSettingsDangerZoneState(() => data.dangerSettings);
	const organizationSection = $derived(data.dangerSettings.sections.organization);
	const dangerZoneSection = $derived(dangerZoneState.section);
	const currentMember = $derived(data.dangerSettings.currentMember);

	const transferEnhance: SubmitFunction = () => {
		transferLoading = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
				await update();
				if (result.type === 'success') dangerZoneState.closeTransferConfirmation();
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
		bind:transferTargetId={dangerZoneState.transferTargetId}
		onTransferConfirm={() => dangerZoneState.openTransferConfirmation()}
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

{#if dangerZoneState.showTransferConfirm && dangerZoneState.transferTargetId}
	<AppDialog.Root
		bind:open={dangerZoneState.showTransferConfirm}
		closeBlocked={transferLoading || dangerZoneState.transferCloseBlocked}
		onClose={() => dangerZoneState.closeTransferConfirmation()}
	>
		<AppDialog.Content closeBlocked={transferLoading || dangerZoneState.transferCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Transfer Ownership</AppDialog.Title>
				<AppDialog.Description>
					Transfer owner authority to {dangerZoneState.selectedTransferCandidate?.email ?? 'the selected member'}.
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
					<input type="hidden" name="newOwnerId" value={dangerZoneState.transferTargetId} />
					<Label for="confirmTransferOwner">Type the member email to confirm</Label>
					<Input
						id="confirmTransferOwner"
						name="confirmTransferEmail"
						type="text"
						bind:value={dangerZoneState.transferConfirmText}
						placeholder={dangerZoneState.selectedTransferCandidate?.email ?? 'member@example.com'}
						autocomplete="off"
					/>
				</form>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={transferLoading}
					onclick={() => dangerZoneState.closeTransferConfirmation()}>Cancel</Button
				>
				<Button
					type="submit"
					form="transfer-ownership-form"
					variant="destructive"
					disabled={transferLoading || !dangerZoneState.transferConfirmMatches}
				>
					{transferLoading ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
