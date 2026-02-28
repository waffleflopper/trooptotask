<script lang="ts">
	import { enhance } from '$app/forms';
	import OrganizationMemberManager from '$lib/components/OrganizationMemberManager.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { data, form } = $props();
	let loading = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	let showSidebar = $state(false);
</script>

<svelte:head>
	<title>Settings - {data.organization?.name} - Troop to Task</title>
</svelte:head>

<Sidebar
	orgId={data.orgId}
	orgName={data.orgName}
	isOpen={showSidebar}
	onClose={() => (showSidebar = false)}
	onToggleTheme={() => themeStore.toggle()}
	isDarkTheme={themeStore.isDark}
	permissions={data.permissions}
	allOrgs={data.allOrgs}
/>

<div class="page">
	<header class="page-header mobile-only">
		<h1>Settings</h1>
		<button class="mobile-menu-btn" onclick={() => (showSidebar = true)} aria-label="Open menu">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="3" y1="12" x2="21" y2="12" />
				<line x1="3" y1="6" x2="21" y2="6" />
				<line x1="3" y1="18" x2="21" y2="18" />
			</svg>
		</button>
	</header>

	<div class="toolbar-header">
		<h2>Organization Settings</h2>
	</div>

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
							value={data.organization?.name ?? ''}
							required
						/>
					</div>

					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Saving...' : 'Update Name'}
					</button>
				</form>
			{:else}
				<p class="org-name-display">{data.organization?.name}</p>
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
			<p>This will permanently delete <strong>{data.organization?.name}</strong> and all associated data.</p>
			<p class="danger-warning">This action cannot be undone.</p>

			<div class="form-group">
				<label class="label" for="confirmDelete">
					Type <strong>{data.organization?.name}</strong> to confirm:
				</label>
				<input
					id="confirmDelete"
					type="text"
					class="input"
					bind:value={deleteConfirmText}
					placeholder="Enter organization name"
				/>
			</div>

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
			>
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showDeleteConfirm = false)}>
						Cancel
					</button>
					<button
						type="submit"
						class="btn btn-danger"
						disabled={loading || deleteConfirmText !== data.organization?.name}
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
		margin-left: var(--sidebar-width);
	}

	/* Mobile header - only visible on mobile */
	.page-header.mobile-only {
		display: none;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: #0F0F0F;
		color: #F0EDE6;
		border-bottom: 1px solid #2A2A2A;
	}

	.page-header h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
	}

	.mobile-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: transparent;
		border: 1px solid #2A2A2A;
		color: #8A8780;
	}

	.mobile-menu-btn:hover {
		border-color: #8A8780;
		color: #F0EDE6;
	}

	.mobile-menu-btn svg {
		width: 24px;
		height: 24px;
	}

	.toolbar-header {
		display: flex;
		align-items: center;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.toolbar-header h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
		color: var(--color-text);
		margin: 0;
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
		.page {
			margin-left: 0;
		}

		.page-header.mobile-only {
			display: flex;
		}

		.toolbar-header {
			display: none;
		}

		.page-content {
			padding: var(--spacing-md);
		}

		.settings-card {
			padding: var(--spacing-md);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.page {
			margin-left: var(--sidebar-width);
		}

		.page-content {
			padding: var(--spacing-md);
		}
	}
</style>
