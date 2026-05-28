<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import type { SettingsDangerSectionData } from './settingsSectionTypes';

	let {
		orgName,
		form,
		section,
		transferTargetId = $bindable(null),
		onTransferConfirm,
		onDeleteConfirm
	}: {
		orgName: string | null;
		form: { [key: string]: unknown; deleteError?: string } | null;
		section: SettingsDangerSectionData;
		transferTargetId?: string | null;
		onTransferConfirm: () => void;
		onDeleteConfirm: () => void;
	} = $props();

	const transferOwnershipCandidates = $derived(section.transferOwnershipCandidates);
	const noTransferTargetValue = 'none';
	const selectedTransferTargetValue = $derived(transferTargetId ?? noTransferTargetValue);
	const selectedTransferTargetLabel = $derived(
		transferOwnershipCandidates.find((member) => member.userId === transferTargetId)?.email ?? 'Select member...'
	);
</script>

<div class="grid gap-4">
	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="destructive-actions-heading"
	>
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="destructive-actions-heading" class="font-heading text-lg font-semibold tracking-tight">
					Destructive Actions
				</h2>
				<p class="text-sm text-muted-foreground">Owner-only controls for irreversible organization changes.</p>
			</div>
			<Badge variant="destructive">Owner only</Badge>
		</div>
		<Separator />

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<Label for="transfer-owner-target">Transfer ownership</Label>
				<p class="text-sm text-muted-foreground">Hand the Owner role to another member. You will become Admin.</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Select.Root
					type="single"
					value={selectedTransferTargetValue}
					onValueChange={(value) => (transferTargetId = value === noTransferTargetValue ? null : value)}
				>
					<Select.Trigger id="transfer-owner-target" class="w-full min-w-56 md:w-64">
						{selectedTransferTargetLabel}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={noTransferTargetValue} label="Select member..." />
						{#each transferOwnershipCandidates as member (member.id)}
							<Select.Item value={member.userId} label={member.email ?? 'Unknown member'} />
						{/each}
					</Select.Content>
				</Select.Root>
				<Button type="button" variant="outline" size="sm" disabled={!transferTargetId} onclick={onTransferConfirm}>
					Transfer Ownership
				</Button>
				{#if transferOwnershipCandidates.length === 0}
					<span class="basis-full text-sm text-muted-foreground">No eligible member account is available.</span>
				{/if}
			</div>
		</div>

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p class="text-sm font-medium">Purge archived</p>
				<p class="text-sm text-muted-foreground">
					Permanently delete all archived personnel. Bypasses the retention window.
				</p>
			</div>
			<div>
				<Button type="button" variant="outline" size="sm" disabled title="Coming soon" aria-disabled="true">
					Purge Archived
					<Badge variant="outline">Coming Soon</Badge>
				</Button>
			</div>
		</div>

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p class="text-sm font-medium">Delete organization</p>
				<p class="text-sm text-muted-foreground">
					All personnel, training, calendar, and audit data is permanently destroyed. This action cannot be undone.
				</p>
			</div>
			<div class="grid gap-2">
				{#if form?.deleteError}<p class="text-sm text-destructive">{form.deleteError}</p>{/if}
				<Button type="button" variant="destructive" size="sm" onclick={onDeleteConfirm}>Delete {orgName}</Button>
			</div>
		</div>
	</section>
</div>
