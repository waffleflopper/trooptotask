<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { onDestroy, tick, untrack } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	type PendingOperation = { kind: 'create' } | { kind: 'reload' } | { kind: 'toggle' | 'delete'; id: string };
	let pending = $state<PendingOperation | null>(null);
	let needsReload = $state(false);
	let actionError = $state<string | null | undefined>(undefined);
	const displayedError = $derived(actionError === undefined ? form?.error : actionError);
	const writesDisabled = $derived(pending !== null || needsReload);
	let pageLifetime = 0;
	let editorLifetime = 0;
	let requestId = 0;
	let currentActor = untrack(() => data.adminUserId);
	let createButton = $state<HTMLButtonElement | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);
	let reloadButton = $state<HTMLButtonElement | null>(null);
	let deleteRequest = $state<{ title: string; form: HTMLFormElement; submitter: HTMLElement | null } | null>(null);
	let confirmedDeleteForm: HTMLFormElement | null = null;

	function retirePage() {
		pageLifetime += 1;
		editorLifetime += 1;
		pending = null;
		needsReload = false;
		actionError = null;
		showCreateForm = false;
		deleteRequest = null;
	}
	beforeNavigate(retirePage);
	onDestroy(retirePage);
	$effect(() => {
		if (data.adminUserId !== currentActor) {
			currentActor = data.adminUserId;
			retirePage();
		}
	});

	async function setCreateForm(open: boolean) {
		editorLifetime += 1;
		actionError = null;
		showCreateForm = open;
		await tick();
		(open ? titleInput : createButton)?.focus();
	}

	// The pressed button disables while the write and its re-read run, which drops focus to the page.
	async function restoreFocus(submitter: HTMLElement | null) {
		await tick();
		if (document.activeElement && document.activeElement !== document.body) return;
		const pressed = submitter instanceof HTMLButtonElement && submitter.isConnected && !submitter.disabled;
		(pressed ? submitter : (reloadButton ?? createButton ?? titleInput))?.focus();
	}

	function confirmDelete() {
		if (!deleteRequest) return;
		confirmedDeleteForm = deleteRequest.form;
		deleteRequest.form.requestSubmit(deleteRequest.submitter);
	}

	async function cancelDelete() {
		const submitter = deleteRequest?.submitter;
		deleteRequest = null;
		await tick();
		submitter?.focus();
	}

	async function refreshAnnouncements(isCurrent: () => boolean) {
		try {
			await invalidateAll();
			if (isCurrent()) needsReload = false;
		} catch {
			if (isCurrent()) actionError = 'Announcements could not be refreshed. Reload them before another save.';
		}
	}

	async function reloadAnnouncements() {
		if (pending) return;
		const lifetime = pageLifetime;
		const actorId = data.adminUserId;
		const token = ++requestId;
		const isCurrent = () => pageLifetime === lifetime && data.adminUserId === actorId && requestId === token;
		pending = { kind: 'reload' };
		actionError = null;
		try {
			await refreshAnnouncements(isCurrent);
		} finally {
			if (isCurrent()) pending = null;
		}
	}

	const submitAnnouncement =
		(operation: Exclude<PendingOperation, { kind: 'reload' }>): SubmitFunction =>
		({ cancel, formElement, submitter }) => {
			if (writesDisabled) {
				cancel();
				return;
			}
			if (operation.kind === 'delete' && confirmedDeleteForm !== formElement) {
				cancel();
				const title = data.announcements.find((announcement) => announcement.id === operation.id)?.title ?? '';
				deleteRequest = { title, form: formElement, submitter };
				return;
			}
			confirmedDeleteForm = null;
			const lifetime = pageLifetime;
			const actorId = data.adminUserId;
			const editor = editorLifetime;
			const token = ++requestId;
			const isCurrent = () => pageLifetime === lifetime && data.adminUserId === actorId && requestId === token;
			const isCurrentEditor = () => isCurrent() && editorLifetime === editor && formElement.isConnected;
			pending = operation;
			actionError = null;
			return async ({ result, update }) => {
				if (!isCurrent()) return;
				try {
					if (result.type === 'redirect') {
						await update({ invalidateAll: false });
						return;
					}
					if (result.type === 'failure' && result.status < 500) {
						if (isCurrentEditor())
							actionError =
								typeof result.data?.error === 'string' ? result.data.error : 'Announcement could not be saved.';
						return;
					}
					needsReload = true;
					if (result.type === 'error' || result.type === 'failure') {
						if (isCurrentEditor())
							actionError = 'The save result could not be confirmed. Check current announcements before trying again.';
						return;
					}
					if (operation.kind === 'create' && isCurrentEditor()) setCreateForm(false);
					await refreshAnnouncements(isCurrent);
				} finally {
					if (isCurrent()) {
						pending = null;
						if (operation.kind === 'delete') deleteRequest = null;
						void restoreFocus(submitter);
					}
				}
			};
		};

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
				<Button bind:ref={createButton} onclick={() => setCreateForm(true)}>Create Announcement</Button>
			{/if}
		{/snippet}
	</PageShell.Header>

	{#if displayedError}
		<Alert.Root variant="destructive">
			<Alert.Description>{displayedError}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if needsReload}
		<Alert.Root variant="warning">
			<Alert.Description>Check current announcements before another save.</Alert.Description>
			<Alert.Action
				><Button bind:ref={reloadButton} variant="outline" onclick={reloadAnnouncements} disabled={pending !== null}
					>Reload Announcements</Button
				></Alert.Action
			>
		</Alert.Root>
	{/if}

	{#if showCreateForm}
		<Card.Root>
			<Card.Header>
				<Card.Title>New Announcement</Card.Title>
				<Card.Description>Keep the message short, direct, and operationally clear.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/create" class="grid gap-4" use:enhance={submitAnnouncement({ kind: 'create' })}>
					<Field.Root>
						<Field.Label for="title">Title</Field.Label>
						<Input
							bind:ref={titleInput}
							id="title"
							name="title"
							type="text"
							maxlength={200}
							placeholder="Announcement title"
							required
						/>
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
						<Button type="button" variant="outline" onclick={() => setCreateForm(false)}>Cancel</Button>
						<Button type="submit" disabled={writesDisabled}>
							{#if pending?.kind === 'create'}<Spinner />{/if}
							{pending?.kind === 'create' ? 'Saving...' : 'Save'}
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
								use:enhance={submitAnnouncement({ kind: 'toggle', id: announcement.id })}
							>
								<input type="hidden" name="id" value={announcement.id} />
								<Button
									type="submit"
									variant="outline"
									disabled={writesDisabled}
									aria-label={`${announcement.is_active ? 'Deactivate' : 'Activate'} ${announcement.title}`}
								>
									{#if pending?.kind === 'toggle' && pending.id === announcement.id}<Spinner />{/if}
									{announcement.is_active ? 'Deactivate' : 'Activate'}
								</Button>
							</form>
							<form
								method="POST"
								action="?/delete"
								use:enhance={submitAnnouncement({ kind: 'delete', id: announcement.id })}
							>
								<input type="hidden" name="id" value={announcement.id} />
								<Button
									type="submit"
									variant="destructive"
									disabled={writesDisabled}
									aria-label={`Delete ${announcement.title}`}
								>
									{#if pending?.kind === 'delete' && pending.id === announcement.id}<Spinner />{/if}
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

{#if deleteRequest}
	<ConfirmDialog
		title="Delete announcement"
		message={`Delete "${deleteRequest.title}"? This cannot be undone.`}
		confirmLabel="Delete"
		loading={pending?.kind === 'delete'}
		onConfirm={confirmDelete}
		onCancel={cancelDelete}
	/>
{/if}
