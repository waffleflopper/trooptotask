<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let creating = $state(false);
	let togglingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);

	function getTypeColor(type: string): string {
		if (type === 'info') return '#3b82f6';
		if (type === 'warning') return '#f59e0b';
		if (type === 'maintenance') return '#ef4444';
		return '#6b7280';
	}

	function getStatus(announcement: { is_active: boolean; expires_at: string | null }): {
		label: string;
		color: string;
	} {
		if (announcement.expires_at && new Date(announcement.expires_at) < new Date()) {
			return { label: 'EXPIRED', color: '#9ca3af' };
		}
		if (announcement.is_active) {
			return { label: 'ACTIVE', color: '#22c55e' };
		}
		return { label: 'INACTIVE', color: '#6b7280' };
	}
</script>

<div class="announcements-page">
	<div class="page-header">
		<h1>Announcements</h1>
		{#if !showCreateForm}
			<button class="btn btn-primary" onclick={() => (showCreateForm = true)}> Create Announcement </button>
		{/if}
	</div>

	{#if form?.error}
		<div class="error-banner">{form.error}</div>
	{/if}

	{#if showCreateForm}
		<div class="create-form-card">
			<h2>New Announcement</h2>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					creating = true;
					return async ({ update }) => {
						await update();
						creating = false;
						if (!form?.error) {
							showCreateForm = false;
						}
					};
				}}
			>
				<div class="form-group">
					<label class="label" for="title">Title</label>
					<input
						id="title"
						name="title"
						class="input"
						type="text"
						maxlength="200"
						placeholder="Announcement title"
						required
					/>
				</div>

				<div class="form-group">
					<label class="label" for="message">Message</label>
					<textarea
						id="message"
						name="message"
						class="input"
						rows="4"
						maxlength="1000"
						placeholder="Announcement message"
						required
					></textarea>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label class="label" for="type">Type</label>
						<select id="type" name="type" class="select" required>
							<option value="info">Info</option>
							<option value="warning">Warning</option>
							<option value="maintenance">Maintenance</option>
						</select>
					</div>

					<div class="form-group">
						<label class="label" for="expiresAt">Expires At (optional)</label>
						<input id="expiresAt" name="expiresAt" class="input" type="datetime-local" />
					</div>
				</div>

				<div class="form-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showCreateForm = false)}> Cancel </button>
					<button class="btn btn-primary" type="submit" disabled={creating}>
						{#if creating}<Spinner />{/if}
						{creating ? 'Saving...' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	<div class="announcements-list">
		{#if data.announcements.length === 0}
			<EmptyState message="No announcements yet." />
		{:else}
			{#each data.announcements as announcement (announcement.id)}
				{@const status = getStatus(announcement)}
				<div class="announcement-card">
					<div class="announcement-header">
						<div class="announcement-meta">
							<span class="announcement-title">{announcement.title}</span>
							<div class="badges">
								<Badge label={announcement.type.toUpperCase()} color={getTypeColor(announcement.type)} bold={true} />
								<Badge label={status.label} color={status.color} />
							</div>
						</div>
						<div class="announcement-actions">
							<form
								method="POST"
								action="?/toggle"
								use:enhance={() => {
									togglingId = announcement.id;
									return async ({ update }) => {
										await update();
										togglingId = null;
									};
								}}
							>
								<input type="hidden" name="id" value={announcement.id} />
								<button class="btn btn-secondary btn-sm" type="submit" disabled={togglingId === announcement.id}>
									{#if togglingId === announcement.id}<Spinner color="#333" />{/if}
									{announcement.is_active ? 'Deactivate' : 'Activate'}
								</button>
							</form>

							<form
								method="POST"
								action="?/delete"
								use:enhance={() => {
									deletingId = announcement.id;
									return async ({ update }) => {
										await update();
										deletingId = null;
									};
								}}
								onsubmit={(e) => {
									if (!confirm('Delete this announcement? This cannot be undone.')) {
										e.preventDefault();
									}
								}}
							>
								<input type="hidden" name="id" value={announcement.id} />
								<button class="btn btn-danger btn-sm" type="submit" disabled={deletingId === announcement.id}>
									{#if deletingId === announcement.id}<Spinner />{/if}
									Delete
								</button>
							</form>
						</div>
					</div>

					<p class="announcement-message">{announcement.message}</p>

					<div class="announcement-footer">
						<span class="text-muted">Created {formatDisplayDate(announcement.created_at)}</span>
						{#if announcement.expires_at}
							<span class="text-muted">Expires {formatDisplayDate(announcement.expires_at)}</span>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.announcements-page {
		padding: var(--spacing-lg);
		max-width: 900px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-lg);
	}

	.page-header h1 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin: 0;
	}

	.error-banner {
		background: #fef2f2;
		border: 1px solid var(--color-error);
		color: var(--color-error);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		font-size: var(--font-size-sm);
	}

	.create-form-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.create-form-card h2 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0 0 var(--spacing-md) 0;
	}

	.form-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
		margin-top: var(--spacing-md);
	}

	.announcements-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.announcement-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
	}

	.announcement-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
	}

	.announcement-meta {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.announcement-title {
		font-weight: 600;
		font-size: var(--font-size-base);
	}

	.badges {
		display: flex;
		gap: var(--spacing-xs);
	}

	.announcement-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.announcement-message {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0 0 var(--spacing-sm) 0;
		line-height: 1.5;
	}

	.announcement-footer {
		display: flex;
		gap: var(--spacing-md);
		font-size: var(--font-size-xs);
	}
</style>
