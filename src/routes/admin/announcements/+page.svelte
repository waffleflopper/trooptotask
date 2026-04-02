<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { ADMIN_STATUS_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let creating = $state(false);
	let togglingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);

	function getStatus(announcement: { is_active: boolean; expires_at: string | null }) {
		if (announcement.expires_at && new Date(announcement.expires_at) < new Date()) {
			return { label: 'Expired', color: ADMIN_STATUS_COLORS.expired };
		}
		return announcement.is_active
			? { label: 'Active', color: ADMIN_STATUS_COLORS.active }
			: { label: 'Inactive', color: ADMIN_STATUS_COLORS.reviewed };
	}
</script>

<svelte:head>
	<title>Announcements - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell admin-page-shell--compact">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Platform Messaging</p>
			<h1 class="admin-page-title">Announcements</h1>
			<p class="admin-page-subtitle">
				Publish and retire platform-wide messages without leaving the internal admin workspace.
			</p>
		</div>
		<div class="admin-page-actions">
			{#if !showCreateForm}
				<button class="btn btn-primary" onclick={() => (showCreateForm = true)}>Create Announcement</button>
			{/if}
		</div>
	</header>

	{#if form?.error}
		<div class="admin-alert admin-alert--error">{form.error}</div>
	{/if}

	{#if showCreateForm}
		<section class="admin-panel">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">New Announcement</h2>
					<p class="admin-panel__meta">Keep the message short, direct, and operationally clear.</p>
				</div>
			</div>
			<form
				method="POST"
				action="?/create"
				class="announcement-form"
				use:enhance={() => {
					creating = true;
					return async ({ update }) => {
						await update();
						creating = false;
						if (!form?.error) showCreateForm = false;
					};
				}}
			>
				<div class="admin-toolbar__field">
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
				<div class="admin-toolbar__field">
					<label class="label" for="message">Message</label>
					<textarea
						id="message"
						name="message"
						class="input textarea"
						rows="4"
						maxlength="1000"
						placeholder="Announcement message"
						required
					></textarea>
				</div>
				<div class="announcement-form__row">
					<div class="admin-toolbar__field">
						<label class="label" for="type">Type</label>
						<select id="type" name="type" class="select" required>
							<option value="info">Info</option>
							<option value="warning">Warning</option>
							<option value="maintenance">Maintenance</option>
						</select>
					</div>
					<div class="admin-toolbar__field">
						<label class="label" for="expiresAt">Expires At</label>
						<input id="expiresAt" name="expiresAt" class="input" type="datetime-local" />
					</div>
				</div>
				<div class="announcement-form__actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showCreateForm = false)}>Cancel</button>
					<button class="btn btn-primary" type="submit" disabled={creating}>
						{#if creating}<Spinner />{/if}
						{creating ? 'Saving...' : 'Save'}
					</button>
				</div>
			</form>
		</section>
	{/if}

	<div class="announcement-stack">
		{#if data.announcements.length === 0}
			<section class="admin-panel"><EmptyState message="No announcements yet." /></section>
		{:else}
			{#each data.announcements as announcement (announcement.id)}
				{@const status = getStatus(announcement)}
				<section class="admin-panel announcement-card">
					<div class="announcement-card__header">
						<div class="announcement-card__copy">
							<h2>{announcement.title}</h2>
							<div class="announcement-card__badges">
								<Badge
									label={formatAdminLabel(announcement.type)}
									color={ADMIN_STATUS_COLORS[announcement.type] ?? 'var(--ink-35)'}
								/>
								<Badge label={status.label} color={status.color} />
							</div>
						</div>
						<div class="announcement-card__actions">
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
									{#if togglingId === announcement.id}<Spinner color="currentColor" />{/if}
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
								onsubmit={(event) => {
									if (!confirm('Delete this announcement? This cannot be undone.')) event.preventDefault();
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
					<p class="announcement-card__message">{announcement.message}</p>
					<p class="announcement-card__meta">
						Created {formatDisplayDate(announcement.created_at)}
						{#if announcement.expires_at}
							• Expires {formatDisplayDate(announcement.expires_at)}{/if}
					</p>
				</section>
			{/each}
		{/if}
	</div>
</div>

<style>
	.announcement-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.announcement-form,
	.announcement-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.announcement-form__row,
	.announcement-form__actions,
	.announcement-card__header,
	.announcement-card__actions,
	.announcement-card__badges {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.announcement-form__actions,
	.announcement-card__header {
		justify-content: space-between;
	}

	.announcement-card__copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.announcement-card__copy h2,
	.announcement-card__message,
	.announcement-card__meta {
		margin: 0;
	}

	.announcement-card__copy h2 {
		font-family: var(--font-display);
		font-size: 1.7rem;
		line-height: 0.98;
		text-transform: uppercase;
	}

	.announcement-card__message {
		line-height: 1.6;
	}

	.announcement-card__meta {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.textarea {
		resize: vertical;
		min-height: 110px;
	}

	@media (max-width: 700px) {
		.announcement-form__row {
			flex-direction: column;
		}
	}
</style>
