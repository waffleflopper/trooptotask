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
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { restoreFocus, settleAction } from '$lib/utils/settleAction';
	import BannerPreview from './BannerPreview.svelte';
	import { followStreamedRead } from './streamedRead.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const banners = followStreamedRead(() => data.banners);
	const dismissals = followStreamedRead(() => data.dismissals);
	const loaded = $derived(banners.current.status === 'loaded' ? banners.current.value : null);
	const announcements = $derived(loaded?.status === 'loaded' ? loaded.announcements : []);
	const listFailed = $derived(banners.current.status === 'failed' || loaded?.status === 'failed');
	const listPending = $derived(banners.current.status === 'pending');
	const dismissalCounts = $derived.by(() => {
		const current = dismissals.current;
		if (current.status === 'pending') return 'pending' as const;
		if (current.status === 'failed' || current.value.status === 'failed') return 'failed' as const;
		return current.value.counts;
	});

	let draftTitle = $state('');
	let draftMessage = $state('');
	let draftType = $state<'info' | 'warning' | 'maintenance'>('info');
	let draftExpiry = $state('');
	const draftExpiresAt = $derived(draftExpiry ? new Date(draftExpiry).toISOString() : null);

	let showCreateForm = $state(false);
	type PendingOperation =
		| { kind: 'create' }
		| { kind: 'reload' }
		| { kind: 'toggle' | 'delete'; id: string; title: string };
	let pending = $state<PendingOperation | null>(null);
	let needsReload = $state(false);
	let actionError = $state<string | null | undefined>(undefined);
	const displayedError = $derived(actionError === undefined ? form?.error : actionError);
	const writesDisabled = $derived(pending !== null || needsReload);
	let pageLifetime = 0;
	let editorLifetime = 0;
	let requestId = 0;
	let currentActor = untrack(() => data.adminUserId);
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

	const toolbarLabel = 'Banner controls';
	function createButton(): HTMLElement | null {
		return document.querySelector<HTMLElement>(
			`[data-slot="workspace-toolbar"][aria-label="${toolbarLabel}"] [data-toolbar-item="create"] button`
		);
	}

	async function setCreateForm(open: boolean) {
		editorLifetime += 1;
		actionError = null;
		if (open) {
			draftTitle = '';
			draftMessage = '';
			draftType = 'info';
			draftExpiry = '';
		}
		showCreateForm = open;
		await tick();
		(open ? titleInput : createButton())?.focus();
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

	async function reloadBanners() {
		if (pending) return;
		const lifetime = pageLifetime;
		const actorId = data.adminUserId;
		const token = ++requestId;
		const isCurrent = () => pageLifetime === lifetime && data.adminUserId === actorId && requestId === token;
		pending = { kind: 'reload' };
		actionError = null;
		try {
			await invalidateAll();
			if (isCurrent()) needsReload = false;
		} catch {
			if (isCurrent()) actionError = 'Banners could not be refreshed. Reload them before another save.';
		}
		if (!isCurrent()) return;
		pending = null;
		await tick();
		if (isCurrent()) restoreFocus([reloadButton, createButton(), titleInput]);
	}

	const submitBanner =
		(operation: Exclude<PendingOperation, { kind: 'reload' }>): SubmitFunction =>
		({ cancel, formElement, submitter }) => {
			if (writesDisabled) {
				cancel();
				return;
			}
			if (operation.kind === 'delete' && confirmedDeleteForm !== formElement) {
				cancel();
				deleteRequest = { title: operation.title, form: formElement, submitter };
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
			return async (outcome) => {
				const { result } = outcome;
				// A 5xx or an unexpected error may have saved, so writes wait for a read-only reload.
				const unconfirmed = result.type === 'error' || (result.type === 'failure' && result.status >= 500);
				await settleAction(outcome, {
					isCurrent,
					settled: (error) => {
						pending = null;
						if (operation.kind === 'delete') deleteRequest = null;
						if (unconfirmed || error) needsReload = true;
						if (unconfirmed) {
							if (isCurrentEditor())
								actionError = 'The save result could not be confirmed. Check current banners before trying again.';
						} else if (error) {
							actionError = 'Saved, but banners could not be refreshed. Reload them before another save.';
						} else if (result.type === 'failure') {
							if (isCurrentEditor())
								actionError = typeof result.data?.error === 'string' ? result.data.error : 'Banner could not be saved.';
						} else if (operation.kind === 'create' && isCurrentEditor()) {
							editorLifetime += 1;
							showCreateForm = false;
						}
					},
					focus: () => [submitter, reloadButton, createButton(), titleInput]
				});
			};
		};

	function getStatus(announcement: { isActive: boolean; expiresAt: string | null }) {
		if (announcement.expiresAt && new Date(announcement.expiresAt) < new Date()) {
			return { label: 'Expired', value: 'expired' };
		}
		return announcement.isActive ? { label: 'Active', value: 'active' } : { label: 'Inactive', value: 'reviewed' };
	}

	function dismissalLabel(count: number) {
		if (count === 0) return 'Not dismissed yet';
		return `Dismissed by ${count} ${count === 1 ? 'account' : 'accounts'}`;
	}
</script>

<svelte:head>
	<title>Banners - Announcements - Admin - Troop to Task</title>
</svelte:head>

{#if !showCreateForm}
	<WorkspaceToolbar
		ariaLabel={toolbarLabel}
		items={[]}
		primary={{ kind: 'action', id: 'create', label: 'Create Banner', onclick: () => setCreateForm(true) }}
	/>
{/if}

{#if displayedError}
	<Alert.Root variant="destructive">
		<Alert.Description>{displayedError}</Alert.Description>
	</Alert.Root>
{/if}
{#if needsReload}
	<Alert.Root variant="warning">
		<Alert.Description>Check current banners before another save.</Alert.Description>
		<Button
			bind:ref={reloadButton}
			class="mt-1 w-fit"
			variant="outline"
			onclick={reloadBanners}
			aria-disabled={pending ? 'true' : undefined}
			aria-busy={pending?.kind === 'reload' || undefined}
		>
			{#if pending?.kind === 'reload'}<Spinner />{/if}
			Reload Banners
		</Button>
	</Alert.Root>
{/if}

{#if showCreateForm}
	<Card.Root>
		<Card.Header>
			<Card.Title>New Banner</Card.Title>
			<Card.Description>Keep the message short, direct, and operationally clear.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<form method="POST" action="?/create" class="grid gap-4" use:enhance={submitBanner({ kind: 'create' })}>
				<Field.Root>
					<Field.Label for="title">Title</Field.Label>
					<Input
						bind:ref={titleInput}
						bind:value={draftTitle}
						id="title"
						name="title"
						type="text"
						maxlength={200}
						placeholder="Banner title"
						required
					/>
				</Field.Root>
				<Field.Root>
					<Field.Label for="message">Message</Field.Label>
					<Textarea
						bind:value={draftMessage}
						id="message"
						name="message"
						rows={4}
						maxlength={1000}
						placeholder="Banner message"
						required
					></Textarea>
				</Field.Root>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Root>
						<Field.Label for="type">Type</Field.Label>
						<NativeSelect id="type" name="type" bind:value={draftType} required>
							<option value="info">Info</option>
							<option value="warning">Warning</option>
							<option value="maintenance">Maintenance</option>
						</NativeSelect>
					</Field.Root>
					<Field.Root>
						<Field.Label for="expiresAtLocal">Expires At</Field.Label>
						<Input id="expiresAtLocal" type="datetime-local" bind:value={draftExpiry} />
						<input type="hidden" name="expiresAt" value={draftExpiresAt ?? ''} />
					</Field.Root>
				</div>
				<div class="flex flex-wrap justify-end gap-2">
					<Button type="button" variant="outline" onclick={() => setCreateForm(false)}>Cancel</Button>
					<Button
						type="submit"
						disabled={needsReload}
						aria-disabled={pending ? 'true' : undefined}
						aria-busy={pending?.kind === 'create' || undefined}
					>
						{#if pending?.kind === 'create'}<Spinner />{/if}
						{pending?.kind === 'create' ? 'Saving...' : 'Save'}
					</Button>
				</div>
			</form>
			<div class="grid content-start gap-2">
				<p class="text-sm font-medium">Preview</p>
				<BannerPreview title={draftTitle} message={draftMessage} type={draftType} expiresAt={draftExpiresAt} />
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<div class="grid gap-3" aria-busy={listPending || undefined}>
	{#if listPending}
		{#each [0, 1] as placeholder (placeholder)}
			<Card.Root data-testid="banner-skeleton">
				<Card.Header class="gap-2">
					<Skeleton class="h-5 w-48" />
					<Skeleton class="h-5 w-32" />
				</Card.Header>
				<Card.Content class="grid gap-2">
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-2/3" />
				</Card.Content>
			</Card.Root>
		{/each}
	{:else if listFailed}
		<Alert.Root variant="destructive">
			<Alert.Description>Banners could not be loaded.</Alert.Description>
			<Button
				class="mt-1 w-fit"
				variant="outline"
				onclick={reloadBanners}
				aria-disabled={pending ? 'true' : undefined}
				aria-busy={pending?.kind === 'reload' || undefined}
			>
				{#if pending?.kind === 'reload'}<Spinner />{/if}
				Retry
			</Button>
		</Alert.Root>
	{:else if announcements.length === 0}
		<Card.Root>
			<Card.Content>
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No banners yet.</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			</Card.Content>
		</Card.Root>
	{:else}
		{#each announcements as announcement (announcement.id)}
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
							use:enhance={submitBanner({ kind: 'toggle', id: announcement.id, title: announcement.title })}
						>
							<input type="hidden" name="id" value={announcement.id} />
							<input type="hidden" name="isActive" value={String(!announcement.isActive)} />
							<Button
								type="submit"
								variant="outline"
								disabled={needsReload}
								aria-disabled={pending ? 'true' : undefined}
								aria-busy={(pending?.kind === 'toggle' && pending.id === announcement.id) || undefined}
								aria-label={`${announcement.isActive ? 'Deactivate' : 'Activate'} ${announcement.title}`}
							>
								{#if pending?.kind === 'toggle' && pending.id === announcement.id}<Spinner />{/if}
								{announcement.isActive ? 'Deactivate' : 'Activate'}
							</Button>
						</form>
						<form
							method="POST"
							action="?/delete"
							use:enhance={submitBanner({ kind: 'delete', id: announcement.id, title: announcement.title })}
						>
							<input type="hidden" name="id" value={announcement.id} />
							<Button
								type="submit"
								variant="destructive"
								disabled={needsReload}
								aria-disabled={pending ? 'true' : undefined}
								aria-busy={(pending?.kind === 'delete' && pending.id === announcement.id) || undefined}
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
						Created {formatDisplayDate(announcement.createdAt)}
						{#if announcement.expiresAt}
							/ Expires {formatDisplayDate(announcement.expiresAt)}{/if}
					</p>
					<p class="text-xs text-muted-foreground" data-testid="banner-dismissals">
						{#if dismissalCounts === 'pending'}
							<Skeleton class="inline-block h-3 w-32 align-middle" />
						{:else if dismissalCounts === 'failed'}
							Dismissal count unavailable
						{:else}
							{dismissalLabel(dismissalCounts[announcement.id] ?? 0)}
						{/if}
					</p>
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</div>

{#if deleteRequest}
	<ConfirmDialog
		title="Delete banner"
		message={`Delete "${deleteRequest.title}"? This cannot be undone.`}
		confirmLabel="Delete"
		loading={pending?.kind === 'delete'}
		onConfirm={confirmDelete}
		onCancel={cancelDelete}
	/>
{/if}
