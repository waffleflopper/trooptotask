<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
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

<PageShell.Root width="content" density="compact">
	<PageShell.Header
		title="Announcements"
		subtitle="Publish and retire platform-wide messages from the internal admin workspace."
	>
		{#snippet actions()}
			{#if !showCreateForm}
				<Button onclick={() => (showCreateForm = true)}>Create Announcement</Button>
			{/if}
		{/snippet}
	</PageShell.Header>

	{#if form?.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{form.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if showCreateForm}
		<Card.Root>
			<Card.Header>
				<Card.Title>New Announcement</Card.Title>
				<Card.Description>Keep the message short, direct, and operationally clear.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/create"
					class="grid gap-4"
					use:enhance={() => {
						creating = true;
						return async ({ update }) => {
							await update();
							creating = false;
							if (!form?.error) showCreateForm = false;
						};
					}}
				>
					<Field.Root>
						<Field.Label for="title">Title</Field.Label>
						<Input id="title" name="title" type="text" maxlength={200} placeholder="Announcement title" required />
					</Field.Root>
					<Field.Root>
						<Field.Label for="message">Message</Field.Label>
						<Textarea id="message" name="message" rows={4} maxlength={1000} placeholder="Announcement message" required
						></Textarea>
					</Field.Root>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="type">Type</Field.Label>
							<NativeSelect id="type" name="type" required>
								<option value="info">Info</option>
								<option value="warning">Warning</option>
								<option value="maintenance">Maintenance</option>
							</NativeSelect>
						</Field.Root>
						<Field.Root>
							<Field.Label for="expiresAt">Expires At</Field.Label>
							<Input id="expiresAt" name="expiresAt" type="datetime-local" />
						</Field.Root>
					</div>
					<div class="flex flex-wrap justify-end gap-2">
						<Button type="button" variant="outline" onclick={() => (showCreateForm = false)}>Cancel</Button>
						<Button type="submit" disabled={creating}>
							{#if creating}<Spinner />{/if}
							{creating ? 'Saving...' : 'Save'}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="grid gap-3">
		{#if data.announcements.length === 0}
			<Card.Root>
				<Card.Content>
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>No announcements yet.</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				</Card.Content>
			</Card.Root>
		{:else}
			{#each data.announcements as announcement (announcement.id)}
				{@const status = getStatus(announcement)}
				<Card.Root>
					<Card.Header class="gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div class="grid gap-2">
							<Card.Title>{announcement.title}</Card.Title>
							<div class="flex flex-wrap gap-2">
								<Badge variant={adminBadgeVariant(announcement.type)}>{formatAdminLabel(announcement.type)}</Badge>
								<Badge variant={adminBadgeVariant(status.value)}>{status.label}</Badge>
							</div>
						</div>
						<div class="flex flex-wrap gap-2 sm:justify-end">
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
									{#if togglingId === announcement.id}<Spinner />{/if}
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
					</Card.Header>
					<Card.Content class="grid gap-3">
						<p class="text-sm leading-6">{announcement.message}</p>
						<p class="text-xs text-muted-foreground">
							Created {formatDisplayDate(announcement.created_at)}
							{#if announcement.expires_at}
								/ Expires {formatDisplayDate(announcement.expires_at)}{/if}
						</p>
					</Card.Content>
				</Card.Root>
			{/each}
		{/if}
	</div>
</PageShell.Root>
