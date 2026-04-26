<script lang="ts">
	import { enhance } from '$app/forms';
	import OrganizationMemberManager from '$features/groups/components/OrganizationMemberManager.svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { ToolbarActions, type ToolbarActionConfig } from '$lib/components/ui/toolbar';
	import { isBillingEnabled } from '$lib/config/billing';

	let { data, form } = $props();
	let loading = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');

	let exporting = $state(false);
	let exportingExcel = $state(false);
	let exportError = $state('');
	let exportSuccess = $state(false);

	const normalizedOrgName = $derived(normalizeOrganizationName(data.orgName ?? ''));
	const deleteConfirmMatches = $derived(normalizeOrganizationName(deleteConfirmText) === normalizedOrgName);
	const settingsToolbarActions = $derived.by(() => {
		const actions: ToolbarActionConfig[] = [
			{ id: 'sign-out', label: 'Sign Out', href: '/auth/logout', priority: 'low', variant: 'secondary' },
			{
				id: 'switch-organization',
				label: 'Switch Organization',
				href: '/dashboard?show=all',
				priority: 'normal',
				variant: 'secondary'
			}
		];

		if ((data.isOwner || data.isAdmin) && isBillingEnabled) {
			actions.push({
				id: 'manage-billing',
				label: 'Manage Billing',
				href: `/org/${data.orgId}/billing`,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			});
		}

		return actions;
	});

	function normalizeOrganizationName(value: string): string {
		return value.trim().replace(/\s+/g, ' ');
	}

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

	async function handleExportExcel() {
		if (exportingExcel) return;
		exportingExcel = true;
		exportError = '';
		exportSuccess = false;

		try {
			const res = await fetch(`/org/${data.orgId}/api/export-excel`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					exportError = body.error || 'Export failed. Please try again.';
				} else {
					exportError = 'Export failed. Please try again.';
				}
				return;
			}

			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? `org-export-${data.orgId}.xlsx`;

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
			exportingExcel = false;
		}
	}
</script>

<svelte:head>
	<title>Settings - {data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<main class="page-content">
		<FloatingPageToolbar ariaLabel="Organization settings controls" leadingMin="0" collapse="medium">
			<ToolbarActions
				actions={settingsToolbarActions}
				ariaLabel="Organization settings actions"
				overflowAriaLabel="More organization settings actions"
				overflowIconOnly
			/>
		</FloatingPageToolbar>

		<div class="settings-card">
			<div class="section-heading">
				<p class="section-label">Organization Profile</p>
				<h2>Organization Information</h2>
			</div>

			{#if data.isOwner || data.isAdmin}
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
					{#if form?.nameSuccess}
						<div class="success-message">Organization name updated!</div>
					{/if}

					<div class="form-group">
						<label class="label" for="name">Organization Name</label>
						<input id="name" name="name" type="text" class="input" value={data.orgName ?? ''} required />
					</div>

					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Saving...' : 'Update Name'}
					</button>
				</form>
			{:else}
				<p class="org-name-display">{data.orgName}</p>
				<p class="hint">Only the organization owner or admin can edit the name.</p>
			{/if}
		</div>

		<OrganizationMemberManager
			orgId={data.orgId}
			members={data.members}
			invitations={data.invitations}
			isOwner={data.isOwner ?? false}
			isAdmin={data.isAdmin ?? false}
			canManageMembers={data.canManageMembers ?? false}
			groups={data.groups}
			form={form ?? undefined}
		/>

		{#if data.isOwner || data.isAdmin || data.permissions?.canManageMembers}
			<div class="settings-card">
				<div class="section-heading">
					<p class="section-label">Data Control</p>
					<h2>Data Export</h2>
				</div>
				<p class="section-description">
					Download all organization data. JSON for backups and integrations, or Excel for a human-readable workbook with
					named sheets.
				</p>

				{#if data.exportInfo.isLimited}
					<p class="export-usage">
						Exports this month: {data.exportInfo.exportsUsed} / {data.exportInfo.exportsLimit}
					</p>
					{#if data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit}
						<p class="export-limit-warning">Export limit reached. Upgrade your plan for unlimited exports.</p>
					{/if}
				{/if}

				{#if exportError}
					<div class="error-message">{exportError}</div>
				{/if}
				{#if exportSuccess}
					<div class="success-message">Export downloaded successfully!</div>
				{/if}

				<div class="export-buttons">
					<button
						class="btn btn-primary"
						onclick={handleExport}
						disabled={exporting ||
							exportingExcel ||
							(data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit)}
					>
						{#if exporting}<Spinner />{/if}
						{exporting ? 'Generating...' : 'Export as JSON'}
					</button>
					<button
						class="btn btn-primary"
						onclick={handleExportExcel}
						disabled={exporting ||
							exportingExcel ||
							(data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit)}
					>
						{#if exportingExcel}<Spinner />{/if}
						{exportingExcel ? 'Generating...' : 'Export as Excel'}
					</button>
				</div>
			</div>
		{/if}

		{#if data.isOwner}
			<div class="settings-card danger-zone">
				<div class="section-heading">
					<p class="section-label">Destructive Action</p>
					<h2>Danger Zone</h2>
				</div>
				<p class="danger-warning">
					Deleting an organization is permanent and cannot be undone. All personnel, calendar data, training records,
					and settings will be permanently deleted.
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
	<Modal
		title="Delete Organization"
		onClose={() => (showDeleteConfirm = false)}
		width="450px"
		titleId="delete-org-title"
	>
		<p>This will permanently delete <strong>{data.orgName}</strong> and all associated data.</p>
		<p class="danger-warning">This action cannot be undone.</p>

		<form
			id="delete-org-form"
			method="POST"
			action="?/deleteOrganization"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			onsubmit={(e) => {
				if (!deleteConfirmMatches) e.preventDefault();
			}}
		>
			<div class="form-group">
				<label class="label" for="confirmDelete">
					Type <strong>{data.orgName}</strong> to confirm:
				</label>
				<input
					id="confirmDelete"
					name="confirmName"
					type="text"
					class="input"
					bind:value={deleteConfirmText}
					placeholder="Enter organization name"
					autocomplete="off"
				/>
			</div>
		</form>

		{#snippet footer()}
			<button type="button" class="btn btn-secondary" onclick={() => (showDeleteConfirm = false)}> Cancel </button>
			<button type="submit" form="delete-org-form" class="btn btn-danger" disabled={loading || !deleteConfirmMatches}>
				{loading ? 'Deleting...' : 'Delete Permanently'}
			</button>
		{/snippet}
	</Modal>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
	}

	.page-content {
		flex: 1;
		max-width: 1040px;
		margin: 0 auto;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		width: 100%;
	}

	.section-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.settings-card {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.section-heading {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-bottom: var(--sp-3);
		border-bottom: var(--border-thin);
	}

	.section-label {
		color: var(--amber);
	}

	.settings-card h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
	}

	.section-description {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.org-name-display {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.error-message {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		color: var(--danger);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.success-message {
		background: color-mix(in srgb, var(--success-bg) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		color: var(--success);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.export-buttons {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.export-usage {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.export-limit-warning {
		margin: 0;
		padding: var(--sp-3) var(--sp-4);
		font-size: var(--text-sm);
		color: var(--amber-dark);
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
	}

	.danger-zone {
		border-color: color-mix(in srgb, var(--danger) 34%, var(--ink-15) 66%);
		background: color-mix(in srgb, var(--danger-bg) 30%, var(--surface-panel) 70%);
	}

	.danger-zone h2 {
		color: var(--danger);
	}

	.danger-warning {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-4);
		}

		.settings-card {
			padding: var(--sp-4);
		}

		.export-buttons {
			flex-direction: column;
		}
	}
</style>
