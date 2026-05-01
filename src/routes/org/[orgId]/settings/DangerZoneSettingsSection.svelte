<script lang="ts">
	import type { OrganizationMember } from '$lib/types';

	let {
		orgName,
		form,
		transferOwnershipCandidates,
		transferTargetId = $bindable(null),
		onTransferConfirm,
		onDeleteConfirm
	}: {
		orgName: string | null;
		form: { [key: string]: unknown; deleteError?: string } | null;
		transferOwnershipCandidates: OrganizationMember[];
		transferTargetId?: string | null;
		onTransferConfirm: () => void;
		onDeleteConfirm: () => void;
	} = $props();
</script>

<div class="danger-zone-tab">
	<section class="ledger-section danger-ledger" aria-labelledby="destructive-actions-heading">
		<div class="ledger-heading">
			<span>!</span>
			<h3 id="destructive-actions-heading">Destructive Actions</h3>
			<p class="state-label state-label--danger">Owner only</p>
		</div>

		<div class="ledger-row">
			<div>
				<label class="field-label" for="transfer-owner-target">Transfer ownership</label>
				<p class="field-hint">Hand the Owner role to another member. You will become Admin.</p>
			</div>
			<div class="danger-command-group">
				<select
					id="transfer-owner-target"
					class="input danger-select"
					value={transferTargetId ?? ''}
					onchange={(event) => (transferTargetId = event.currentTarget.value || null)}
				>
					<option value="">Select member...</option>
					{#each transferOwnershipCandidates as member (member.id)}
						<option value={member.userId}>{member.email}</option>
					{/each}
				</select>
				<button
					type="button"
					class="btn btn-secondary btn-sm btn-danger-outline"
					disabled={!transferTargetId}
					onclick={onTransferConfirm}
				>
					Transfer Ownership
				</button>
				{#if transferOwnershipCandidates.length === 0}
					<span class="export-help">No eligible member account is available.</span>
				{/if}
			</div>
		</div>

		<div class="ledger-row">
			<div>
				<p class="field-label">Purge archived</p>
				<p class="field-hint">Permanently delete all archived personnel. Bypasses the retention window.</p>
			</div>
			<div class="danger-command-group">
				<button
					type="button"
					class="btn btn-secondary btn-sm btn-danger-outline btn-coming-soon"
					disabled
					title="Coming soon"
					aria-disabled="true"
				>
					Purge Archived
					<span>Coming Soon</span>
				</button>
			</div>
		</div>

		<div class="ledger-row">
			<div>
				<p class="field-label">Delete organization</p>
				<p class="field-hint">
					All personnel, training, calendar, and audit data is permanently destroyed. This action cannot be undone.
				</p>
			</div>
			<div class="danger-command-group">
				{#if form?.deleteError}<div class="error-message">{form.deleteError}</div>{/if}
				<button type="button" class="btn btn-danger btn-sm" onclick={onDeleteConfirm}>Delete {orgName}</button>
			</div>
		</div>
	</section>
</div>
