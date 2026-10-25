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
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { restoreFocus, settleAction } from '$lib/utils/settleAction';
	import type { PlatformAnnouncement } from '$features/platform-admin/contracts';
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

	type PendingOperation =
		| { kind: 'create' }
		| { kind: 'reload' }
		| { kind: 'toggle' | 'delete'; id: string; title: string };
	let pending = $state<PendingOperation | null>(null);
	let needsReload = $state(false);
	let actionError = $state<string | null | undefined>(undefined);
	const displayedError = $derived(actionError === undefined ? form?.error : actionError);
	const writesDisabled = $derived(pending !== null || needsReload);
	const composerLocked = $derived(pending?.kind === 'create');
	let pageLifetime = 0;
	let editorLifetime = 0;
	let requestId = 0;
	let currentActor = untrack(() => data.adminUserId);
	let titleInput = $state<HTMLInputElement | null>(null);
	let reloadButton = $state<HTMLButtonElement | null>(null);
	let deleteRequest = $state<{ title: string; form: HTMLFormElement; submitter: HTMLElement | null } | null>(null);
	let confirmedDeleteForm: HTMLFormElement | null = null;
	// A write or reload stays pending until the read it triggered has replied, so the next write only starts from a
	// list that includes this one.
	let awaitingRead = $state<{ stale: Promise<unknown>; done: (ok: boolean) => void } | null>(null);

	$effect(() => {
		const wait = awaitingRead;
		if (!wait) return;
		const current = banners.current;
		if (current.status === 'pending' || (current.status === 'loaded' && current.refreshing)) return;
		if (banners.settled === wait.stale) return;
		awaitingRead = null;
		untrack(() => wait.done(current.status === 'loaded' && current.value.status === 'loaded'));
	});

	function retirePage() {
		pageLifetime += 1;
		editorLifetime += 1;
		pending = null;
		needsReload = false;
		actionError = null;
		deleteRequest = null;
		awaitingRead = null;
	}
	beforeNavigate(retirePage);
	onDestroy(retirePage);
	$effect(() => {
		if (data.adminUserId !== currentActor) {
			currentActor = data.adminUserId;
			retirePage();
		}
	});

	function resetDraft() {
		editorLifetime += 1;
		actionError = null;
		draftTitle = '';
		draftMessage = '';
		draftType = 'info';
		draftExpiry = '';
	}

	async function cancelDraft() {
		resetDraft();
		await tick();
		titleInput?.focus();
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
		const stale = data.banners;
		pending = { kind: 'reload' };
		actionError = null;
		const finish = async (ok: boolean) => {
			if (!isCurrent()) return;
			pending = null;
			if (ok) needsReload = false;
			else if (needsReload) actionError = 'Banners could not be refreshed. Reload them before another save.';
			await tick();
			if (isCurrent()) restoreFocus([reloadButton, titleInput]);
		};
		try {
			await invalidateAll();
		} catch {
			await finish(false);
			return;
		}
		if (isCurrent()) awaitingRead = { stale, done: finish };
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
			const stale = data.banners;
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
						if (operation.kind === 'delete') deleteRequest = null;
						if (result.type === 'success' && !error) {
							awaitingRead = {
								stale,
								done: (ok) => {
									if (!isCurrent()) return;
									pending = null;
									if (operation.kind === 'create' && isCurrentEditor()) resetDraft();
									if (!ok) {
										needsReload = true;
										actionError = 'Saved, but banners could not be refreshed. Reload them before another save.';
									}
								}
							};
							return;
						}
						pending = null;
						if (unconfirmed || error) needsReload = true;
						if (unconfirmed) {
							if (isCurrentEditor())
								actionError = 'The save result could not be confirmed. Check current banners before trying again.';
						} else if (error) {
							actionError = 'Saved, but banners could not be refreshed. Reload them before another save.';
						} else if (result.type === 'failure') {
							if (isCurrentEditor())
								actionError = typeof result.data?.error === 'string' ? result.data.error : 'Banner could not be saved.';
						}
					},
					focus: () => [submitter, reloadButton, titleInput],
					reset: false
				});
			};
		};

	type BannerState = 'live' | 'ended' | 'off';
	function bannerState(announcement: { isActive: boolean; expiresAt: string | null }): BannerState {
		if (announcement.expiresAt && new Date(announcement.expiresAt) < new Date()) return 'ended';
		return announcement.isActive ? 'live' : 'off';
	}
	const liveBanners = $derived(announcements.filter((announcement) => bannerState(announcement) === 'live'));
	const endedBanners = $derived(announcements.filter((announcement) => bannerState(announcement) !== 'live'));

	function bannerWindow(announcement: { createdAt: string; expiresAt: string | null }, state: BannerState) {
		const since = formatDisplayDate(announcement.createdAt);
		const until = announcement.expiresAt ? formatDisplayDate(announcement.expiresAt) : null;
		if (state === 'live') return until ? `since ${since} · until ${until}` : `since ${since}`;
		if (state === 'ended') return `${since} to ${until}`;
		return `since ${since} · turned off`;
	}

	function dismissalLabel(count: number) {
		return count === 0 ? 'not dismissed yet' : `${count} dismissed`;
	}
</script>

<svelte:head>
	<title>Banners - Announcements - Admin - Troop to Task</title>
</svelte:head>

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
			Reload banners
		</Button>
	</Alert.Root>
{/if}

{#snippet bannerRow(announcement: PlatformAnnouncement, state: BannerState)}
	<li class="grid gap-1.5 border-b py-3" data-testid="banner-row">
		<div class="flex items-start justify-between gap-3">
			<h3 class="min-w-0 text-sm font-semibold wrap-anywhere">{announcement.title}</h3>
			<Badge variant={state === 'live' ? 'success' : 'outline'} mono>
				{state === 'live' ? 'Live' : state === 'ended' ? 'Ended' : 'Off'}
			</Badge>
		</div>
		<p class="text-xs text-muted-foreground">
			{formatAdminLabel(announcement.type)} · {bannerWindow(announcement, state)} ·
			<span data-testid="banner-dismissals">
				{#if dismissalCounts === 'pending'}
					<Skeleton class="inline-block h-3 w-20 align-middle" />
				{:else if dismissalCounts === 'failed'}
					dismissal count unavailable
				{:else}
					{dismissalLabel(dismissalCounts[announcement.id] ?? 0)}
				{/if}
			</span>
		</p>
		<p class="line-clamp-2 text-sm text-muted-foreground">{announcement.message}</p>
		<div class="flex flex-wrap gap-2">
			{#if state !== 'ended'}
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
						size="sm"
						disabled={needsReload}
						aria-disabled={pending ? 'true' : undefined}
						aria-busy={(pending?.kind === 'toggle' && pending.id === announcement.id) || undefined}
						aria-label={`${announcement.isActive ? 'Turn off' : 'Turn on'} ${announcement.title}`}
					>
						{#if pending?.kind === 'toggle' && pending.id === announcement.id}<Spinner />{/if}
						{announcement.isActive ? 'Turn off' : 'Turn on'}
					</Button>
				</form>
			{/if}
			<form
				method="POST"
				action="?/delete"
				use:enhance={submitBanner({ kind: 'delete', id: announcement.id, title: announcement.title })}
			>
				<input type="hidden" name="id" value={announcement.id} />
				<Button
					type="submit"
					variant="destructive"
					size="sm"
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
	</li>
{/snippet}

<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
	<Card.Root>
		<Card.Header>
			<Card.Title>New banner</Card.Title>
		</Card.Header>
		<Card.Content>
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
						readonly={composerLocked}
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
						rows={3}
						maxlength={1000}
						readonly={composerLocked}
						placeholder="Banner message"
						required
					></Textarea>
				</Field.Root>
				<div class="grid gap-4 sm:grid-cols-[auto_minmax(0,16rem)] sm:items-start">
					<Field.Root>
						<Field.Label id="banner-type-label">Type</Field.Label>
						<ToggleGroup.Root
							type="single"
							aria-labelledby="banner-type-label"
							disabled={composerLocked}
							bind:value={
								() => draftType,
								(value) => {
									if (value) draftType = value as typeof draftType;
								}
							}
						>
							<ToggleGroup.Item value="info">Info</ToggleGroup.Item>
							<ToggleGroup.Item value="warning">Warning</ToggleGroup.Item>
							<ToggleGroup.Item value="maintenance">Maintenance</ToggleGroup.Item>
						</ToggleGroup.Root>
						<input type="hidden" name="type" value={draftType} />
					</Field.Root>
					<Field.Root>
						<Field.Label for="expiresAtLocal">Ends</Field.Label>
						<Input id="expiresAtLocal" type="datetime-local" bind:value={draftExpiry} readonly={composerLocked} />
						<input type="hidden" name="expiresAt" value={draftExpiresAt ?? ''} />
						<Field.Description>Leave empty to show until you turn it off.</Field.Description>
					</Field.Root>
				</div>
				<div class="grid gap-2">
					<p class="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
						Preview · what every signed-in user sees
					</p>
					<BannerPreview title={draftTitle} message={draftMessage} type={draftType} expiresAt={draftExpiresAt} />
				</div>
				<div class="flex flex-wrap justify-end gap-2">
					<Button type="button" variant="ghost" disabled={composerLocked} onclick={cancelDraft}>Cancel</Button>
					<Button
						type="submit"
						disabled={needsReload}
						aria-disabled={pending ? 'true' : undefined}
						aria-busy={pending?.kind === 'create' || undefined}
					>
						{#if pending?.kind === 'create'}<Spinner />{/if}
						{pending?.kind === 'create' ? 'Publishing...' : 'Publish to all users'}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-6" aria-busy={listPending || undefined}>
		{#if listPending}
			<section class="grid gap-3" data-testid="banner-skeleton">
				<Skeleton class="h-7 w-28" />
				{#each [0, 1] as placeholder (placeholder)}
					<div class="grid gap-2 border-b py-3">
						<Skeleton class="h-5 w-3/4" />
						<Skeleton class="h-4 w-1/2" />
						<Skeleton class="h-4 w-full" />
					</div>
				{/each}
			</section>
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
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>No banners yet.</Empty.Title>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<section class="grid gap-1" aria-label="Live now">
				<PageShell.SectionHeader title="Live now" size="compact" ruled />
				{#if liveBanners.length === 0}
					<p class="py-3 text-sm text-muted-foreground">No banner is live.</p>
				{:else}
					<ul class="m-0 list-none p-0">
						{#each liveBanners as announcement (announcement.id)}
							{@render bannerRow(announcement, 'live')}
						{/each}
					</ul>
				{/if}
			</section>
			{#if endedBanners.length > 0}
				<section class="grid gap-1" aria-label="Ended">
					<PageShell.SectionHeader title="Ended" size="compact" ruled />
					<ul class="m-0 list-none p-0">
						{#each endedBanners as announcement (announcement.id)}
							{@render bannerRow(announcement, bannerState(announcement))}
						{/each}
					</ul>
				</section>
			{/if}
		{/if}
	</div>
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
