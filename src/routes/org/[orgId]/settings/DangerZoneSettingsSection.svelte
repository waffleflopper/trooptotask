<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspaceModel';

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
		section: OrganizationSettingsWorkspace['sections']['dangerZone'];
		transferTargetId?: string | null;
		onTransferConfirm: () => void;
		onDeleteConfirm: () => void;
	} = $props();

	const transferOwnershipCandidates = $derived(section.transferOwnershipCandidates);
</script>

<div class="grid gap-4">
	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="destructive-actions-heading"
	>
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h3 id="destructive-actions-heading" class="text-lg font-semibold tracking-tight">Destructive Actions</h3>
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
				<select
					id="transfer-owner-target"
					class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
					value={transferTargetId ?? ''}
					onchange={(event) => (transferTargetId = event.currentTarget.value || null)}
				>
					<option value="">Select member...</option>
					{#each transferOwnershipCandidates as member (member.id)}
						<option value={member.userId}>{member.email}</option>
					{/each}
				</select>
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
