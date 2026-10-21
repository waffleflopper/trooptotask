<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { settleAction } from '$lib/utils/settleAction';
	import type { DangerSettingsData, DestructionCounts } from './dangerSettingsTypes';
	import { createOwnershipTransferWorkspace } from './ownershipTransferWorkspace.svelte';
	import * as SettingsLanes from './settings-lanes';

	let {
		orgName,
		settings,
		form
	}: { orgName: string | null; settings: DangerSettingsData; form: Record<string, unknown> | null } = $props();

	let active = true;
	onDestroy(() => {
		active = false;
	});
	const isCurrent = () => active;

	let deleteLoading = $state(false);
	let transferLoading = $state(false);
	let deleteRequestError = $state<string | null>(null);
	let transferRequestError = $state<string | null>(null);
	let deleteButton = $state<HTMLButtonElement | null>(null);
	let transferButton = $state<HTMLButtonElement | null>(null);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	const transferState = createOwnershipTransferWorkspace(() => settings.transferOwnershipCandidates);

	const unit = $derived(orgName ?? '');
	const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ');
	const deleteConfirmMatches = $derived(normalizeName(deleteConfirmText) === normalizeName(unit));
	const noTransferTargetValue = 'none';

	const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

	function destructionItems(counts: DestructionCounts): Array<{ count: number; label: string }> {
		return [
			{ count: counts.activePersonnel, label: plural(counts.activePersonnel, 'person', 'people') },
			{ count: counts.trainingRecords, label: plural(counts.trainingRecords, 'training record', 'training records') },
			{ count: counts.members, label: plural(counts.members, 'member loses access', 'members lose access') },
			{
				count: counts.archivedPersonnel,
				label: plural(counts.archivedPersonnel, 'archived record', 'archived records')
			}
		];
	}

	const transferEnhance: SubmitFunction = ({ cancel }) => {
		if (transferLoading) return cancel();
		transferLoading = true;
		transferRequestError = null;
		return async (outcome) => {
			if (!active) return;
			const { result } = outcome;
			if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
				transferLoading = false;
				return;
			}
			await settleAction(outcome, {
				isCurrent,
				settled: (error) => {
					transferRequestError = error;
					transferLoading = false;
					if (!error && result.type === 'success') transferState.closeTransferConfirmation();
				},
				focus: () => [transferButton]
			});
		};
	};

	const deleteEnhance: SubmitFunction = ({ cancel }) => {
		if (deleteLoading) return cancel();
		deleteLoading = true;
		deleteRequestError = null;
		return async (outcome) => {
			if (!active) return;
			const { result } = outcome;
			if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
				deleteLoading = false;
				return;
			}
			await settleAction(outcome, {
				isCurrent,
				settled: (error) => {
					deleteRequestError = error;
					deleteLoading = false;
				},
				focus: () => [deleteButton]
			});
		};
	};

	function closeDeleteDialog() {
		deleteRequestError = null;
		showDeleteConfirm = false;
		deleteConfirmText = '';
	}

	function closeTransferDialog() {
		transferRequestError = null;
		transferState.closeTransferConfirmation();
	}
</script>

<SettingsLanes.Section variant="destructive">
	<SettingsLanes.Row
		label="Transfer ownership"
		labelFor="transfer-owner-target"
		description="Hand the Owner role to another member. You become an Admin and keep your access."
	>
		{#snippet control()}
			<div class="grid w-full gap-1.5 md:w-auto md:justify-items-end">
				<div class="flex min-w-0 items-center gap-2">
					<Select.Root
						type="single"
						value={transferState.transferTargetId ?? noTransferTargetValue}
						onValueChange={(value) => (transferState.transferTargetId = value === noTransferTargetValue ? null : value)}
					>
						<Select.Trigger id="transfer-owner-target" class="w-full min-w-0 md:w-55">
							<span class="min-w-0 truncate">{transferState.selectedTransferCandidate?.email ?? 'Choose a member'}</span
							>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value={noTransferTargetValue} label="Choose a member" />
							{#each settings.transferOwnershipCandidates as member (member.id)}
								<Select.Item value={member.userId} label={member.email ?? 'Unknown member'} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Button
						type="button"
						variant="destructive"
						disabled={!transferState.transferTargetId}
						onclick={() => transferState.openTransferConfirmation()}
					>
						Transfer
					</Button>
				</div>
				{#if settings.transferOwnershipCandidates.length === 0}
					<p class="text-sm text-muted-foreground">No eligible member account is available.</p>
				{/if}
			</div>
		{/snippet}
	</SettingsLanes.Row>

	<SettingsLanes.Row
		label="Purge archives now"
		muted
		description="Delete every archived person today instead of waiting out the retention period."
	>
		{#snippet control()}
			<span
				class="pt-1.5 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
			>
				Coming soon
			</span>
		{/snippet}
	</SettingsLanes.Row>

	<SettingsLanes.Row
		label={`Delete ${unit}`}
		description="Every record and private file in the unit is deleted for good. The audit history stays, for accountability."
	>
		{#snippet control()}
			<div class="grid gap-1.5 md:justify-items-end">
				<Button type="button" variant="destructive-solid" onclick={() => (showDeleteConfirm = true)}
					>Delete unit…</Button
				>
				{#if form?.deleteError}<p class="text-sm text-destructive-text">{form.deleteError}</p>{/if}
			</div>
		{/snippet}
		{#snippet details()}
			<div class="rounded border border-destructive/20 bg-destructive/[0.06] px-3.5 py-3">
				{#await settings.destructionCounts}
					<div class="flex flex-wrap gap-x-6 gap-y-2" aria-hidden="true">
						{#each ['w-12', 'w-28', 'w-36', 'w-28'] as labelWidth, index (index)}
							<div class="flex items-center gap-1.5">
								<Skeleton class="h-6 w-7" />
								<Skeleton class={`h-4 ${labelWidth}`} />
							</div>
						{/each}
					</div>
					<span class="sr-only">Counting what deleting {unit} destroys</span>
				{:then counts}
					<ul class="flex flex-wrap gap-x-6 gap-y-2" aria-label={`What deleting ${unit} destroys`}>
						{#each destructionItems(counts) as item (item.label)}
							<li class="flex items-baseline gap-1.5">
								<span class="font-heading text-[22px] leading-6 font-extrabold text-destructive-text">{item.count}</span
								>
								<span class="font-mono text-xs leading-5 text-foreground">{item.label}</span>
							</li>
						{/each}
					</ul>
				{:catch}
					<p class="font-mono text-xs leading-6 text-foreground">What deleting {unit} destroys could not be counted.</p>
				{/await}
			</div>
		{/snippet}
	</SettingsLanes.Row>
</SettingsLanes.Section>

{#if showDeleteConfirm}
	<AppDialog.Root
		bind:open={showDeleteConfirm}
		tone="destructive"
		busy={deleteLoading}
		closeBlocked={deleteConfirmText.trim() !== ''}
		onClose={closeDeleteDialog}
	>
		<AppDialog.Content>
			<AppDialog.Header eyebrow="Delete unit · Cannot be undone">
				<AppDialog.Title>Delete {unit}?</AppDialog.Title>
				<AppDialog.Description>
					This permanently deletes the unit, its records and its private files. Retained audit history stays for
					accountability. Once files are removed they can’t be recovered, even if a later step fails.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				{#if deleteRequestError || form?.deleteError}
					<Alert.Root variant="destructive" class="mb-3">
						<Alert.Description>{deleteRequestError ?? form?.deleteError}</Alert.Description>
					</Alert.Root>
				{/if}
				<form
					id="delete-org-form"
					method="POST"
					action="?/deleteOrganization"
					class="grid gap-2"
					use:enhance={deleteEnhance}
					onsubmit={(event) => {
						if (!deleteConfirmMatches) event.preventDefault();
					}}
				>
					<Label for="confirmDelete">Type {unit} to confirm</Label>
					<Input
						id="confirmDelete"
						name="confirmName"
						type="text"
						bind:value={deleteConfirmText}
						autocomplete="off"
						aria-describedby={deleteConfirmMatches ? undefined : 'confirmDelete-hint'}
					/>
					{#if !deleteConfirmMatches}
						<p id="confirmDelete-hint" class="font-mono text-xs leading-5 text-muted-foreground">
							Keep typing. It has to match exactly.
						</p>
					{/if}
				</form>
			</AppDialog.Body>
			<AppDialog.Footer>
				<p class="font-mono text-xs leading-5 text-muted-foreground sm:mr-auto">Signed in as Owner</p>
				<Button type="button" variant="outline" disabled={deleteLoading} onclick={closeDeleteDialog}>Cancel</Button>
				<Button
					bind:ref={deleteButton}
					type="submit"
					form="delete-org-form"
					variant="destructive-solid"
					disabled={!deleteConfirmMatches}
					aria-disabled={deleteLoading ? 'true' : undefined}
					aria-busy={deleteLoading || undefined}
				>
					{deleteLoading ? 'Deleting...' : 'Delete permanently'}
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
					<Alert.Root variant="destructive" class="mb-3">
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
					disabled={!transferState.transferConfirmMatches}
					aria-disabled={transferLoading ? 'true' : undefined}
					aria-busy={transferLoading || undefined}
				>
					{transferLoading ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
