<script lang="ts">
	import { enhance } from '$app/forms';
	import ClinicMemberManager from '$lib/components/ClinicMemberManager.svelte';

	let { data, form } = $props();
	let loading = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
</script>

<svelte:head>
	<title>Settings - {data.clinic?.name} - Troop to Task</title>
</svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<div class="header-content">
			<a href="/clinic/{data.clinicId}" class="back-link">&larr; Back to Calendar</a>
			<h1>Clinic Settings</h1>
		</div>
	</header>

	<main class="settings-content">
		<div class="settings-card">
			<h2>Clinic Information</h2>

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
						<div class="success-message">Clinic name updated!</div>
					{/if}

					<div class="form-group">
						<label class="label" for="name">Clinic Name</label>
						<input
							id="name"
							name="name"
							type="text"
							class="input"
							value={data.clinic?.name ?? ''}
							required
						/>
					</div>

					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Saving...' : 'Update Name'}
					</button>
				</form>
			{:else}
				<p class="clinic-name-display">{data.clinic?.name}</p>
				<p class="hint">Only the clinic owner can edit the name.</p>
			{/if}
		</div>

		<ClinicMemberManager
			clinicId={data.clinicId}
			members={data.members}
			invitations={data.invitations}
			isOwner={data.isOwner}
			canManageMembers={data.canManageMembers}
			{form}
		/>

		<div class="settings-card">
			<h2>Your Account</h2>
			<a href="/auth/logout" class="btn btn-secondary">Sign Out</a>
			<a href="/dashboard?show=all" class="btn btn-secondary">Switch Clinic</a>
		</div>

		{#if data.isOwner}
			<div class="settings-card danger-zone">
				<h2>Danger Zone</h2>
				<p class="danger-warning">
					Deleting a clinic is permanent and cannot be undone. All personnel, calendar data, training records, and settings will be permanently deleted.
				</p>
				{#if form?.deleteError}
					<div class="error-message">{form.deleteError}</div>
				{/if}
				<button type="button" class="btn btn-danger" onclick={() => (showDeleteConfirm = true)}>
					Delete Clinic
				</button>
			</div>
		{/if}
	</main>
</div>

{#if showDeleteConfirm}
	<div class="modal-overlay" onclick={() => (showDeleteConfirm = false)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h3>Delete Clinic</h3>
			<p>This will permanently delete <strong>{data.clinic?.name}</strong> and all associated data.</p>
			<p class="danger-warning">This action cannot be undone.</p>

			<div class="form-group">
				<label class="label" for="confirmDelete">
					Type <strong>{data.clinic?.name}</strong> to confirm:
				</label>
				<input
					id="confirmDelete"
					type="text"
					class="input"
					bind:value={deleteConfirmText}
					placeholder="Enter clinic name"
				/>
			</div>

			<form
				method="POST"
				action="?/deleteClinic"
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
						disabled={loading || deleteConfirmText !== data.clinic?.name}
					>
						{loading ? 'Deleting...' : 'Delete Permanently'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.settings-page {
		min-height: 100%;
		background: var(--color-bg);
	}

	.settings-header {
		background: var(--color-primary);
		color: white;
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.header-content {
		max-width: 800px;
		margin: 0 auto;
	}

	.back-link {
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		font-size: var(--font-size-sm);
	}

	.back-link:hover {
		color: white;
	}

	.settings-header h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		margin-top: var(--spacing-sm);
	}

	.settings-content {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.settings-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.settings-card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
	}

	.hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
	}

	.clinic-name-display {
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
</style>
