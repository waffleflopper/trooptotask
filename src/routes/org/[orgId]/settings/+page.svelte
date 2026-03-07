<script lang="ts">
	import { enhance } from '$app/forms';
	import OrganizationMemberManager from '$lib/components/OrganizationMemberManager.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { data, form } = $props();
	let loading = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');

	let exporting = $state(false);
	let exportError = $state('');
	let exportSuccess = $state(false);

	async function handleExport() {
		if (exporting) return;
		exporting = true;
		exportError = '';
		exportSuccess = false;

		try {
			const res = await fetch(`/org/${data.orgId}/api/export`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					exportError = body.error || 'Export failed. Please try again.';
				} else {
					exportError = 'Export failed. Please try again.';
				}
				return;
			}

			// Trigger file download
			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? `org-export-${data.orgId}.json`;

			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			exportSuccess = true;
		} catch {
			exportError = 'Export failed. Please try again.';
		} finally {
			exporting = false;
		}
	}
</script>

<svelte:head>
	<title>Settings - {data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Organization Settings" helpTopic="settings" />

	<main class="page-content">
		<div class="settings-card">
			<h2>Organization Information</h2>

			{#if data.isOwner}
				<form
					method="POST"
					action="?/updateName"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
				>
					{#if form?.error}
						<div class="error-message">{form.error}</div>
					{/if}
					{#if form?.success}
						<div class="success-message">Organization name updated!</div>
					{/if}

					<div class="form-group">
						<label class="label" for="name">Organization Name</label>
						<input
							id="name"
							name="name"
							type="text"
							class="input"
							value={data.orgName ?? ''}
							required
						/>
					</div>

					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Saving...' : 'Update Name'}
					</button>
				</form>
			{:else}
				<p class="org-name-display">{data.orgName}</p>
				<p class="hint">Only the organization owner can edit the name.</p>
			{/if}
		</div>

		<OrganizationMemberManager
			orgId={data.orgId}
			members={data.members}
			invitations={data.invitations}
			isOwner={data.isOwner}
			canManageMembers={data.canManageMembers}
			form={form ?? undefined}
		/>

		<div class="settings-card">
			<h2>Your Account</h2>
			<a href="/auth/logout" class="btn btn-secondary">Sign Out</a>
			<a href="/dashboard?show=all" class="btn btn-secondary">Switch Organization</a>
		</div>

		{#if data.isOwner || data.canManageMembers}
			<div class="settings-card">
				<h2>Data Export</h2>
				<p class="export-description">
					Download all organization data as a JSON file. This includes personnel, groups,
					training records, availability, counseling records, assignments, onboarding data,
					and rating scheme entries.
				</p>

				{#if data.exportInfo.isLimited}
					<p class="export-usage">
						Exports this month: {data.exportInfo.exportsUsed} / {data.exportInfo.exportsLimit}
					</p>
					{#if data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit}
						<p class="export-limit-warning">
							Export limit reached. Upgrade your plan for unlimited exports.
						</p>
					{/if}
				{/if}

				{#if exportError}
					<div class="error-message">{exportError}</div>
				{/if}
				{#if exportSuccess}
					<div class="success-message">Export downloaded successfully!</div>
				{/if}

				<button
					class="btn btn-primary"
					onclick={handleExport}
					disabled={exporting || (data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit)}
				>
					{#if exporting}<Spinner />{/if}
					{exporting ? 'Generating Export...' : 'Export All Org Data'}
				</button>
			</div>
		{/if}

		{#if data.isOwner}
			<div class="settings-card danger-zone">
				<h2>Danger Zone</h2>
				<p class="danger-warning">
					Deleting an organization is permanent and cannot be undone. All personnel, calendar data, training records, and settings will be permanently deleted.
				</p>
				{#if form?.deleteError}
					<div class="error-message">{form.deleteError}</div>
				{/if}
				<button type="button" class="btn btn-danger" onclick={() => (showDeleteConfirm = true)}>
					Delete Organization
				</button>
			</div>
		{/if}
	</main>
</div>

{#if showDeleteConfirm}
	<div class="modal-overlay" onclick={() => (showDeleteConfirm = false)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h3>Delete Organization</h3>
			<p>This will permanently delete <strong>{data.orgName}</strong> and all associated data.</p>
			<p class="danger-warning">This action cannot be undone.</p>

			<form
				method="POST"
				action="?/deleteOrganization"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				onsubmit={(e) => { if (deleteConfirmText !== data.orgName) e.preventDefault(); }}
			>
				<div class="form-group">
					<label class="label" for="confirmDelete">
						Type <strong>{data.orgName}</strong> to confirm:
					</label>
					<input
						id="confirmDelete"
						type="text"
						class="input"
						bind:value={deleteConfirmText}
						placeholder="Enter organization name"
						autocomplete="off"
					/>
				</div>
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showDeleteConfirm = false)}>
						Cancel
					</button>
					<button
						type="submit"
						class="btn btn-danger"
						disabled={loading || deleteConfirmText !== data.orgName}
					>
						{loading ? 'Deleting...' : 'Delete Permanently'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.page-content {
		flex: 1;
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
		width: 100%;
	}

	.settings-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.settings-card h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
		margin-bottom: var(--spacing-md);
	}

	.hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
	}

	.org-name-display {
		font-size: var(--font-size-lg);
		font-weight: 600;
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.success-message {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #16a34a;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.settings-card .btn + .btn {
		margin-left: var(--spacing-sm);
	}

	.export-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
		line-height: 1.5;
	}

	.export-usage {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-sm);
	}

	.export-limit-warning {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #d97706);
		margin-bottom: var(--spacing-md);
	}

	.danger-zone {
		border-color: #fecaca;
	}

	.danger-zone h2 {
		color: #dc2626;
	}

	.danger-warning {
		color: #dc2626;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.btn-danger {
		background: #dc2626;
		color: white;
		border: none;
	}

	.btn-danger:hover:not(:disabled) {
		background: #b91c1c;
	}

	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		max-width: 450px;
		width: 90%;
	}

	.modal h3 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
		color: #dc2626;
	}

	.modal p {
		margin-bottom: var(--spacing-md);
		color: var(--color-text);
	}

	.modal .form-group {
		margin-bottom: var(--spacing-md);
	}

	.modal-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.page-content {
			padding: var(--spacing-md);
		}

		.settings-card {
			padding: var(--spacing-md);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.page-content {
			padding: var(--spacing-md);
		}
	}
</style>
