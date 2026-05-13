<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import * as Empty from '$lib/components/ui/empty';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let creating = $state(false);
	let togglingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);

	function getStatus(announcement: { is_active: boolean; expires_at: string | null }) {
		if (announcement.expires_at && new Date(announcement.expires_at) < new Date()) {
			return { label: 'Expired', value: 'expired' };
		}
		return announcement.is_active ? { label: 'Active', value: 'active' } : { label: 'Inactive', value: 'reviewed' };
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
				<Button onclick={() => (showCreateForm = true)}>Create Announcement</Button>
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
					<Label for="title">Title</Label>
					<Input id="title" name="title" type="text" maxlength={200} placeholder="Announcement title" required />
				</div>
				<div class="admin-toolbar__field">
					<Label for="message">Message</Label>
					<Textarea
						id="message"
						name="message"
						rows={4}
						maxlength={1000}
						placeholder="Announcement message"
						required
						class="min-h-[110px] resize-y"
					></Textarea>
				</div>
				<div class="announcement-form__row">
					<div class="admin-toolbar__field">
						<Label for="type">Type</Label>
						<NativeSelect id="type" name="type" required>
							<option value="info">Info</option>
							<option value="warning">Warning</option>
							<option value="maintenance">Maintenance</option>
						</NativeSelect>
					</div>
					<div class="admin-toolbar__field">
						<Label for="expiresAt">Expires At</Label>
						<Input id="expiresAt" name="expiresAt" type="datetime-local" />
					</div>
				</div>
				<div class="announcement-form__actions">
					<Button type="button" variant="outline" onclick={() => (showCreateForm = false)}>Cancel</Button>
					<Button type="submit" disabled={creating}>
						{#if creating}<Spinner />{/if}
						{creating ? 'Saving...' : 'Save'}
					</Button>
				</div>
			</form>
		</section>
	{/if}

	<div class="announcement-stack">
		{#if data.announcements.length === 0}
			<section class="admin-panel">
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No announcements yet.</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			</section>
		{:else}
			{#each data.announcements as announcement (announcement.id)}
				{@const status = getStatus(announcement)}
				<section class="admin-panel announcement-card">
					<div class="announcement-card__header">
						<div class="announcement-card__copy">
							<h2>{announcement.title}</h2>
							<div class="announcement-card__badges">
								<Badge variant={adminBadgeVariant(announcement.type)}>{formatAdminLabel(announcement.type)}</Badge>
								<Badge variant={adminBadgeVariant(status.value)}>{status.label}</Badge>
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
								<Button type="submit" variant="outline" disabled={togglingId === announcement.id}>
									{#if togglingId === announcement.id}<Spinner color="currentColor" />{/if}
									{announcement.is_active ? 'Deactivate' : 'Activate'}
								</Button>
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
								<Button type="submit" variant="destructive" disabled={deletingId === announcement.id}>
									{#if deletingId === announcement.id}<Spinner />{/if}
									Delete
								</Button>
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

	@media (max-width: 700px) {
		.announcement-form__row {
			flex-direction: column;
		}
	}
</style>
