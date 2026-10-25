<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
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
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { restoreFocus, settleAction } from '$lib/utils/settleAction';
	import { WHATS_NEW_LIMITS } from '$features/platform-admin/contracts';
	import { cn } from '$lib/utils';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { followStreamedRead } from '../streamedRead.svelte';
	import type { WhatsNewEntry } from '$features/platform-admin/contracts';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const read = followStreamedRead(() => data.entries);
	const loaded = $derived(read.current.status === 'loaded' ? read.current.value : null);
	const entries = $derived(loaded?.status === 'loaded' ? loaded.entries : []);
	const listFailed = $derived(read.current.status === 'failed' || loaded?.status === 'failed');
	const listPending = $derived(read.current.status === 'pending');

	const selection = $derived(page.url.searchParams.get('entry'));
	const selectedEntry = $derived(entries.find((entry) => entry.id === selection) ?? null);
	const missingSelection = $derived(
		selection !== null && selection !== 'new' && selectedEntry === null && !listPending && !listFailed
	);

	let title = $state('');
	let paragraphs = $state<string[]>(['']);
	let loadedKey = $state<string | null>(null);
	let lastEntry = $state.raw<WhatsNewEntry | null>(null);
	// A read that has not confirmed the entry gone (still loading, or failed) keeps the editor and its draft.
	const keepsDraft = $derived(selection !== null && selection === loadedKey && (listPending || listFailed));
	const editorEntry = $derived(selectedEntry ?? (keepsDraft ? lastEntry : null));
	const editing = $derived(selection === 'new' || editorEntry !== null);
	const isPublished = $derived(editorEntry?.publishedOn != null);

	function loadEditor() {
		title = selectedEntry?.title ?? '';
		paragraphs = selectedEntry && selectedEntry.paragraphs.length > 0 ? [...selectedEntry.paragraphs] : [''];
	}

	// The editor takes the entry's text when the selection changes or its entry first arrives. After that only a
	// confirmed write reloads it, and the fields are read-only from submit until the fresh read lands, so no
	// keystroke can be overwritten. A failed read leaves the draft where it is.
	$effect(() => {
		const key = selection === 'new' ? 'new' : selectedEntry ? selectedEntry.id : keepsDraft ? selection : null;
		if (selectedEntry) lastEntry = selectedEntry;
		if (key === untrack(() => loadedKey)) return;
		loadedKey = key;
		lastEntry = selectedEntry;
		untrack(loadEditor);
	});

	type PendingOperation = { kind: 'save' | 'publish' | 'delete' } | { kind: 'reload' };
	let pending = $state<PendingOperation | null>(null);
	let needsReload = $state(false);
	let actionError = $state<string | null | undefined>(undefined);
	const displayedError = $derived(actionError === undefined ? form?.error : actionError);
	const writesDisabled = $derived(pending !== null || needsReload);
	const fieldsLocked = $derived(pending !== null);
	let pageLifetime = 0;
	let requestId = 0;
	let currentActor = untrack(() => data.adminUserId);
	let reloadButton = $state<HTMLButtonElement | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);
	let deleteTarget = $state<{ id: string; title: string } | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);
	let confirmedDelete = false;
	// A write or reload stays pending until the read it triggered has replied, so the next write only starts from a
	// list that includes this one.
	let awaitingRead = $state<{ stale: Promise<unknown>; done: (ok: boolean) => void } | null>(null);

	$effect(() => {
		const wait = awaitingRead;
		if (!wait) return;
		const current = read.current;
		if (current.status === 'pending' || (current.status === 'loaded' && current.refreshing)) return;
		if (read.settled === wait.stale) return;
		awaitingRead = null;
		untrack(() => wait.done(current.status === 'loaded' && current.value.status === 'loaded'));
	});

	$effect(() => {
		if (deleteTarget && deleteTarget.id !== selection) deleteTarget = null;
	});

	function retirePage() {
		pageLifetime += 1;
		pending = null;
		needsReload = false;
		actionError = null;
		deleteTarget = null;
		awaitingRead = null;
	}
	beforeNavigate(({ to, from }) => {
		if (to?.url.pathname !== from?.url.pathname) retirePage();
	});
	onDestroy(retirePage);
	$effect(() => {
		if (data.adminUserId !== currentActor) {
			currentActor = data.adminUserId;
			retirePage();
		}
	});

	function select(id: string | null) {
		actionError = null;
		const query = id === null ? '' : `?entry=${encodeURIComponent(id)}`;
		return goto(`/admin/announcements/whats-new${query}`, { keepFocus: true, noScroll: true });
	}

	async function reload() {
		if (pending) return;
		const lifetime = pageLifetime;
		const token = ++requestId;
		const isCurrent = () => pageLifetime === lifetime && requestId === token;
		const stale = data.entries;
		pending = { kind: 'reload' };
		actionError = null;
		const finish = async (ok: boolean) => {
			if (!isCurrent()) return;
			pending = null;
			if (ok) needsReload = false;
			else if (needsReload) actionError = 'Entries could not be refreshed. Reload them before another save.';
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

	function localToday() {
		const now = new Date();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		return `${now.getFullYear()}-${month}-${day}`;
	}

	const submitEntry =
		(kind: 'save' | 'delete'): SubmitFunction =>
		({ cancel, formData, formElement, submitter }) => {
			if (writesDisabled) {
				cancel();
				return;
			}
			if (kind === 'delete') {
				const target = deleteTarget;
				if (!confirmedDelete || !target) {
					cancel();
					if (editorEntry) deleteTarget = { id: editorEntry.id, title: editorEntry.title };
					return;
				}
				formData.set('id', target.id);
			}
			confirmedDelete = false;
			const publishing = kind === 'save' && submitter?.getAttribute('value') === 'publish';
			if (publishing) formData.set('publishOn', localToday());
			const lifetime = pageLifetime;
			const startedOn = selection;
			const stale = data.entries;
			const token = ++requestId;
			const isCurrent = () => pageLifetime === lifetime && requestId === token;
			const isCurrentEditor = () =>
				isCurrent() && page.url.searchParams.get('entry') === startedOn && formElement.isConnected;
			pending = { kind: publishing ? 'publish' : kind };
			actionError = null;
			return async (outcome) => {
				const { result } = outcome;
				// A 5xx or an unexpected error may have saved, so writes wait for a read-only reload.
				const unconfirmed = result.type === 'error' || (result.type === 'failure' && result.status >= 500);
				await settleAction(outcome, {
					isCurrent,
					settled: (error) => {
						deleteTarget = null;
						if (result.type === 'success' && !error) {
							const saved = result.data as { id?: string; deleted?: boolean } | undefined;
							if (saved?.deleted && page.url.searchParams.get('entry') === startedOn) void select(null);
							awaitingRead = {
								stale,
								done: (ok) => {
									if (!isCurrent()) return;
									pending = null;
									const stillThere = page.url.searchParams.get('entry') === startedOn;
									if (stillThere && saved?.id && saved.id !== startedOn) void select(saved.id);
									else if (stillThere && ok && !saved?.deleted) loadEditor();
									if (!ok) {
										needsReload = true;
										actionError = 'Saved, but entries could not be refreshed. Reload them before another save.';
									}
								}
							};
							return;
						}
						pending = null;
						if (unconfirmed || error) needsReload = true;
						if (unconfirmed) {
							if (isCurrentEditor())
								actionError = 'The save result could not be confirmed. Check current entries before trying again.';
						} else if (error) {
							actionError = 'Saved, but entries could not be refreshed. Reload them before another save.';
						} else if (result.type === 'failure') {
							if (isCurrentEditor())
								actionError = typeof result.data?.error === 'string' ? result.data.error : 'Entry could not be saved.';
						}
					},
					focus: () => [submitter, reloadButton, titleInput],
					reset: false
				});
			};
		};

	function confirmDelete() {
		if (!deleteForm || !deleteTarget) return;
		confirmedDelete = true;
		deleteForm.requestSubmit();
	}

	function addParagraph() {
		if (!fieldsLocked && paragraphs.length < WHATS_NEW_LIMITS.paragraphCount) paragraphs.push('');
	}
	function removeParagraph(index: number) {
		if (fieldsLocked) return;
		paragraphs.splice(index, 1);
		if (paragraphs.length === 0) paragraphs.push('');
	}
	function moveParagraph(index: number, by: -1 | 1) {
		const target = index + by;
		if (fieldsLocked || target < 0 || target >= paragraphs.length) return;
		[paragraphs[index], paragraphs[target]] = [paragraphs[target], paragraphs[index]];
	}
</script>

<svelte:head>
	<title>What's New - Announcements - Admin - Troop to Task</title>
</svelte:head>

{#if displayedError}
	<Alert.Root variant="destructive">
		<Alert.Description>{displayedError}</Alert.Description>
	</Alert.Root>
{/if}
{#if needsReload}
	<Alert.Root variant="warning">
		<Alert.Description>Check current entries before another save.</Alert.Description>
		<Button
			bind:ref={reloadButton}
			class="mt-1 w-fit"
			variant="outline"
			onclick={reload}
			aria-disabled={pending ? 'true' : undefined}
			aria-busy={pending?.kind === 'reload' || undefined}
		>
			{#if pending?.kind === 'reload'}<Spinner />{/if}
			Reload entries
		</Button>
	</Alert.Root>
{/if}

<div class="grid gap-4 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
	<section
		class={cn('grid gap-3', editing && 'max-lg:hidden')}
		aria-label="Entries"
		aria-busy={listPending || undefined}
	>
		<div class="flex items-center justify-between gap-3">
			<h2 class="font-heading text-[22px] leading-[26px] font-bold">Entries</h2>
			<Button type="button" onclick={() => select('new')} aria-disabled={writesDisabled ? 'true' : undefined}>
				<PlusIcon aria-hidden="true" />
				New entry
			</Button>
		</div>
		{#if listPending}
			{#each [0, 1, 2, 3] as placeholder (placeholder)}
				<div class="grid gap-2 border-b px-3 py-3" data-testid="entry-skeleton">
					<Skeleton class="h-5 w-3/4" />
					<Skeleton class="h-4 w-1/2" />
				</div>
			{/each}
		{:else if listFailed}
			<Alert.Root variant="destructive">
				<Alert.Description>Entries could not be loaded.</Alert.Description>
				<Button
					class="mt-1 w-fit"
					variant="outline"
					onclick={reload}
					aria-disabled={pending ? 'true' : undefined}
					aria-busy={pending?.kind === 'reload' || undefined}
				>
					{#if pending?.kind === 'reload'}<Spinner />{/if}
					Retry
				</Button>
			</Alert.Root>
		{:else if entries.length === 0}
			<Card.Root>
				<Card.Content>
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>No entries yet.</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				</Card.Content>
			</Card.Root>
		{:else}
			<ul class="m-0 list-none border-t-2 border-foreground p-0">
				{#each entries as entry (entry.id)}
					<li class="border-b">
						<a
							href={`/admin/announcements/whats-new?entry=${encodeURIComponent(entry.id)}`}
							class={cn(
								'grid gap-1 border-l-2 border-transparent px-3 py-3 text-left no-underline hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
								entry.id === selection && 'border-l-primary bg-muted'
							)}
							aria-current={entry.id === selection ? 'true' : undefined}
							onclick={(event) => {
								if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
								event.preventDefault();
								void select(entry.id);
							}}
						>
							<span class="flex items-start justify-between gap-3">
								<span class="min-w-0 text-sm font-semibold text-foreground wrap-anywhere">{entry.title}</span>
								{#if entry.publishedOn}
									<Badge variant="success" class="font-mono text-[11px] tracking-wide uppercase">Published</Badge>
								{:else}
									<Badge variant="warning" class="font-mono text-[11px] tracking-wide uppercase">Draft</Badge>
								{/if}
							</span>
							<span class="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
								{#if entry.publishedOn}
									{formatDisplayDate(entry.publishedOn)}{entry.shownToUsers ? ' · Shown in app' : ''}
								{:else}
									Not published
								{/if}
							</span>
						</a>
					</li>
				{/each}
			</ul>
			<p class="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
				{entries.length}
				{entries.length === 1 ? 'entry' : 'entries'}
			</p>
		{/if}
	</section>

	<section class={cn('grid gap-3', !editing && 'max-lg:hidden')} aria-label="Entry editor">
		{#if editing}
			<Button type="button" variant="ghost" class="w-fit lg:hidden" onclick={() => select(null)}>Back to entries</Button
			>
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between gap-3">
						<Card.Title>{selection === 'new' ? 'New entry' : 'Edit entry'}</Card.Title>
						{#if isPublished}
							<Badge variant="success" class="font-mono text-[11px] tracking-wide uppercase">Published</Badge>
						{:else}
							<Badge variant="warning" class="font-mono text-[11px] tracking-wide uppercase">Draft</Badge>
						{/if}
					</div>
					<Card.Description>
						{#if isPublished}
							Published {formatDisplayDate(editorEntry?.publishedOn ?? null)}. Edits show for everyone straight away.
						{:else}
							Drafts stay invisible to users until you publish.
						{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form id="entry-form" method="POST" action="?/save" class="grid gap-4" use:enhance={submitEntry('save')}>
						<input type="hidden" name="id" value={selection === 'new' ? '' : (editorEntry?.id ?? '')} />
						<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
							<Field.Root>
								<Field.Label for="entry-title">Title</Field.Label>
								<Input
									bind:ref={titleInput}
									bind:value={title}
									id="entry-title"
									name="title"
									type="text"
									maxlength={WHATS_NEW_LIMITS.titleLength}
									readonly={fieldsLocked}
									required
								/>
							</Field.Root>
							<Field.Root>
								<Field.Label for="entry-date">Date</Field.Label>
								<Input
									id="entry-date"
									type="text"
									readonly
									value={isPublished ? formatDisplayDate(editorEntry?.publishedOn ?? null) : 'Today when published'}
								/>
							</Field.Root>
						</div>
						<div class="grid gap-3">
							<p class="text-sm font-medium">Paragraphs</p>
							{#each paragraphs as _, index (index)}
								<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
									<Textarea
										bind:value={paragraphs[index]}
										name="paragraph"
										rows={3}
										maxlength={WHATS_NEW_LIMITS.paragraphLength}
										readonly={fieldsLocked}
										aria-label={`Paragraph ${index + 1}`}
									></Textarea>
									<div class="flex flex-col items-end gap-1">
										<Button
											type="button"
											variant="ghost"
											size="xs"
											disabled={fieldsLocked}
											onclick={() => removeParagraph(index)}
											aria-label={`Remove paragraph ${index + 1}`}
										>
											Remove
										</Button>
										<div class="flex gap-0.5">
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												disabled={fieldsLocked || index === 0}
												onclick={() => moveParagraph(index, -1)}
												aria-label={`Move paragraph ${index + 1} up`}
											>
												<ArrowUpIcon aria-hidden="true" />
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												disabled={fieldsLocked || index === paragraphs.length - 1}
												onclick={() => moveParagraph(index, 1)}
												aria-label={`Move paragraph ${index + 1} down`}
											>
												<ArrowDownIcon aria-hidden="true" />
											</Button>
										</div>
									</div>
								</div>
							{/each}
							<Button
								type="button"
								variant="outline"
								class="w-fit"
								disabled={fieldsLocked || paragraphs.length >= WHATS_NEW_LIMITS.paragraphCount}
								onclick={addParagraph}
							>
								<PlusIcon aria-hidden="true" />
								Add paragraph
							</Button>
						</div>
					</form>
				</Card.Content>
				<Card.Footer class="flex-wrap justify-end gap-2 border-t">
					{#if editorEntry && !isPublished}
						<form bind:this={deleteForm} method="POST" action="?/delete" use:enhance={submitEntry('delete')}>
							<input type="hidden" name="id" value={editorEntry.id} />
							<Button
								type="submit"
								variant="ghost"
								class="text-danger-foreground hover:text-danger-foreground"
								disabled={needsReload}
								aria-disabled={pending ? 'true' : undefined}
								aria-busy={pending?.kind === 'delete' || undefined}
							>
								{#if pending?.kind === 'delete'}<Spinner />{/if}
								Delete draft
							</Button>
						</form>
					{/if}
					<Button
						type="submit"
						form="entry-form"
						variant={isPublished ? 'default' : 'outline'}
						value="save"
						disabled={needsReload}
						aria-disabled={pending ? 'true' : undefined}
						aria-busy={pending?.kind === 'save' || undefined}
					>
						{#if pending?.kind === 'save'}<Spinner />{/if}
						{isPublished ? 'Save changes' : 'Save draft'}
					</Button>
					{#if !isPublished}
						<Button
							type="submit"
							form="entry-form"
							value="publish"
							disabled={needsReload}
							aria-disabled={pending ? 'true' : undefined}
							aria-busy={pending?.kind === 'publish' || undefined}
						>
							{#if pending?.kind === 'publish'}<Spinner />{/if}
							Publish
						</Button>
					{/if}
				</Card.Footer>
			</Card.Root>
		{:else if missingSelection}
			<Alert.Root variant="warning">
				<Alert.Description>That entry no longer exists.</Alert.Description>
				<Button class="mt-1 w-fit" variant="outline" onclick={() => select(null)}>Back to entries</Button>
			</Alert.Root>
		{:else}
			<Card.Root class="max-lg:hidden">
				<Card.Content>
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>Pick an entry to edit, or start a new one.</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				</Card.Content>
			</Card.Root>
		{/if}
	</section>
</div>

{#if deleteTarget}
	<ConfirmDialog
		title="Delete draft"
		message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
		confirmLabel="Delete"
		loading={pending?.kind === 'delete'}
		onConfirm={confirmDelete}
		onCancel={() => (deleteTarget = null)}
	/>
{/if}
