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
	import XIcon from '@lucide/svelte/icons/x';
	import { followStreamedRead } from '../streamedRead.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const read = followStreamedRead(() => data.entries);
	const loaded = $derived(read.current.status === 'loaded' ? read.current.value : null);
	const entries = $derived(loaded?.status === 'loaded' ? loaded.entries : []);
	const listFailed = $derived(read.current.status === 'failed' || loaded?.status === 'failed');
	const listPending = $derived(read.current.status === 'pending');

	const selection = $derived(page.url.searchParams.get('entry'));
	const selectedEntry = $derived(entries.find((entry) => entry.id === selection) ?? null);
	const editing = $derived(selection === 'new' || selectedEntry !== null);
	const missingSelection = $derived(
		selection !== null && selection !== 'new' && selectedEntry === null && !listPending && !listFailed
	);
	const isPublished = $derived(selectedEntry?.publishedOn != null);

	let title = $state('');
	let paragraphs = $state<string[]>(['']);
	let loadedKey = $state<string | null>(null);

	// The editor takes the entry's text when the selection changes or its entry first arrives, and never again, so a
	// refresh after a save or a slow read cannot overwrite what the operator is typing.
	$effect(() => {
		const key = selection === 'new' ? 'new' : selectedEntry ? selectedEntry.id : null;
		if (key === untrack(() => loadedKey)) return;
		loadedKey = key;
		untrack(() => {
			title = selectedEntry?.title ?? '';
			paragraphs = selectedEntry && selectedEntry.paragraphs.length > 0 ? [...selectedEntry.paragraphs] : [''];
		});
	});

	type PendingOperation = { kind: 'save' | 'publish' | 'delete' } | { kind: 'reload' };
	let pending = $state<PendingOperation | null>(null);
	let needsReload = $state(false);
	let actionError = $state<string | null | undefined>(undefined);
	const displayedError = $derived(actionError === undefined ? form?.error : actionError);
	const writesDisabled = $derived(pending !== null || needsReload);
	let pageLifetime = 0;
	let requestId = 0;
	let currentActor = untrack(() => data.adminUserId);
	let reloadButton = $state<HTMLButtonElement | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);
	let confirmedDelete = false;

	function retirePage() {
		pageLifetime += 1;
		pending = null;
		needsReload = false;
		actionError = null;
		confirmDeleteOpen = false;
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
		pending = { kind: 'reload' };
		actionError = null;
		try {
			await invalidateAll();
			if (isCurrent()) needsReload = false;
		} catch {
			if (isCurrent()) actionError = 'Entries could not be refreshed. Reload them before another save.';
		}
		if (!isCurrent()) return;
		pending = null;
		await tick();
		if (isCurrent()) restoreFocus([reloadButton, titleInput]);
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
			if (kind === 'delete' && !confirmedDelete) {
				cancel();
				confirmDeleteOpen = true;
				return;
			}
			confirmedDelete = false;
			const publishing = kind === 'save' && submitter?.getAttribute('value') === 'publish';
			if (publishing) formData.set('publishOn', localToday());
			const lifetime = pageLifetime;
			const startedOn = selection;
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
						pending = null;
						confirmDeleteOpen = false;
						if (unconfirmed || error) needsReload = true;
						if (unconfirmed) {
							if (isCurrentEditor())
								actionError = 'The save result could not be confirmed. Check current entries before trying again.';
						} else if (error) {
							actionError = 'Saved, but entries could not be refreshed. Reload them before another save.';
						} else if (result.type === 'failure') {
							if (isCurrentEditor())
								actionError = typeof result.data?.error === 'string' ? result.data.error : 'Entry could not be saved.';
						} else if (result.type === 'success' && isCurrentEditor()) {
							const saved = result.data as { id?: string; deleted?: boolean } | undefined;
							if (saved?.deleted) void select(null);
							else if (saved?.id && saved.id !== startedOn) void select(saved.id);
							else loadedKey = null;
						}
					},
					focus: () => [submitter, reloadButton, titleInput],
					reset: false
				});
			};
		};

	function confirmDelete() {
		if (!deleteForm) return;
		confirmedDelete = true;
		deleteForm.requestSubmit();
	}

	function addParagraph() {
		if (paragraphs.length < WHATS_NEW_LIMITS.paragraphCount) paragraphs.push('');
	}
	function removeParagraph(index: number) {
		paragraphs.splice(index, 1);
		if (paragraphs.length === 0) paragraphs.push('');
	}
	function moveParagraph(index: number, by: -1 | 1) {
		const target = index + by;
		if (target < 0 || target >= paragraphs.length) return;
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
			Reload Entries
		</Button>
	</Alert.Root>
{/if}

<div class="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
	<section
		class={cn('grid gap-3', editing && 'max-lg:hidden')}
		aria-label="Entries"
		aria-busy={listPending || undefined}
	>
		<Button
			type="button"
			class="w-fit"
			onclick={() => select('new')}
			aria-disabled={writesDisabled ? 'true' : undefined}
		>
			<PlusIcon aria-hidden="true" />
			New Entry
		</Button>
		{#if listPending}
			{#each [0, 1, 2, 3] as placeholder (placeholder)}
				<Card.Root data-testid="entry-skeleton">
					<Card.Header class="gap-2">
						<Skeleton class="h-5 w-3/4" />
						<Skeleton class="h-4 w-1/2" />
					</Card.Header>
				</Card.Root>
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
			<ul class="m-0 grid list-none gap-2 p-0">
				{#each entries as entry (entry.id)}
					<li>
						<a
							href={`/admin/announcements/whats-new?entry=${encodeURIComponent(entry.id)}`}
							class={cn(
								'grid gap-1.5 rounded-lg border bg-card p-3 text-left no-underline hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
								entry.id === selection && 'border-primary'
							)}
							aria-current={entry.id === selection ? 'true' : undefined}
							onclick={(event) => {
								if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
								event.preventDefault();
								void select(entry.id);
							}}
						>
							<span class="text-sm font-medium text-foreground">{entry.title}</span>
							<span class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								{#if entry.publishedOn}
									<Badge variant="secondary">Published</Badge>
									{formatDisplayDate(entry.publishedOn)}
									{#if entry.shownToUsers}<Badge variant="outline">Shown to users</Badge>{/if}
								{:else}
									<Badge variant="outline">Draft</Badge>
								{/if}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class={cn('grid gap-3', !editing && 'max-lg:hidden')} aria-label="Entry editor">
		{#if editing}
			<Button type="button" variant="ghost" class="w-fit lg:hidden" onclick={() => select(null)}>Back to entries</Button
			>
			<Card.Root>
				<Card.Header>
					<Card.Title>{selection === 'new' ? 'New Entry' : isPublished ? 'Published Entry' : 'Draft Entry'}</Card.Title>
					<Card.Description>
						{#if isPublished}
							Published {formatDisplayDate(selectedEntry?.publishedOn ?? null)}. Edits show for everyone straight away.
						{:else}
							Drafts stay invisible to users until you publish.
						{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form method="POST" action="?/save" class="grid gap-4" use:enhance={submitEntry('save')}>
						<input type="hidden" name="id" value={selection === 'new' ? '' : (selectedEntry?.id ?? '')} />
						<Field.Root>
							<Field.Label for="entry-title">Title</Field.Label>
							<Input
								bind:ref={titleInput}
								bind:value={title}
								id="entry-title"
								name="title"
								type="text"
								maxlength={WHATS_NEW_LIMITS.titleLength}
								required
							/>
						</Field.Root>
						<div class="grid gap-3">
							<p class="text-sm font-medium">Paragraphs</p>
							{#each paragraphs as _, index (index)}
								<div class="grid gap-2 rounded-md border p-2">
									<Textarea
										bind:value={paragraphs[index]}
										name="paragraph"
										rows={3}
										maxlength={WHATS_NEW_LIMITS.paragraphLength}
										aria-label={`Paragraph ${index + 1}`}
									></Textarea>
									<div class="flex flex-wrap gap-1">
										<Button
											type="button"
											variant="ghost"
											size="xs"
											disabled={index === 0}
											onclick={() => moveParagraph(index, -1)}
											aria-label={`Move paragraph ${index + 1} up`}
										>
											<ArrowUpIcon aria-hidden="true" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="xs"
											disabled={index === paragraphs.length - 1}
											onclick={() => moveParagraph(index, 1)}
											aria-label={`Move paragraph ${index + 1} down`}
										>
											<ArrowDownIcon aria-hidden="true" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="xs"
											onclick={() => removeParagraph(index)}
											aria-label={`Remove paragraph ${index + 1}`}
										>
											<XIcon aria-hidden="true" />
										</Button>
									</div>
								</div>
							{/each}
							<Button
								type="button"
								variant="outline"
								class="w-fit"
								disabled={paragraphs.length >= WHATS_NEW_LIMITS.paragraphCount}
								onclick={addParagraph}
							>
								<PlusIcon aria-hidden="true" />
								Add Paragraph
							</Button>
						</div>
						<div class="flex flex-wrap justify-end gap-2">
							<Button
								type="submit"
								variant={isPublished ? 'default' : 'outline'}
								value="save"
								disabled={needsReload}
								aria-disabled={pending ? 'true' : undefined}
								aria-busy={pending?.kind === 'save' || undefined}
							>
								{#if pending?.kind === 'save'}<Spinner />{/if}
								{isPublished ? 'Save Changes' : 'Save Draft'}
							</Button>
							{#if !isPublished}
								<Button
									type="submit"
									value="publish"
									disabled={needsReload}
									aria-disabled={pending ? 'true' : undefined}
									aria-busy={pending?.kind === 'publish' || undefined}
								>
									{#if pending?.kind === 'publish'}<Spinner />{/if}
									Publish
								</Button>
							{/if}
						</div>
					</form>
				</Card.Content>
				{#if selectedEntry && !isPublished}
					<Card.Footer class="justify-end">
						<form bind:this={deleteForm} method="POST" action="?/delete" use:enhance={submitEntry('delete')}>
							<input type="hidden" name="id" value={selectedEntry.id} />
							<Button
								type="submit"
								variant="destructive"
								disabled={needsReload}
								aria-disabled={pending ? 'true' : undefined}
								aria-busy={pending?.kind === 'delete' || undefined}
							>
								{#if pending?.kind === 'delete'}<Spinner />{/if}
								Delete Draft
							</Button>
						</form>
					</Card.Footer>
				{/if}
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

{#if confirmDeleteOpen && selectedEntry}
	<ConfirmDialog
		title="Delete draft"
		message={`Delete "${selectedEntry.title}"? This cannot be undone.`}
		confirmLabel="Delete"
		loading={pending?.kind === 'delete'}
		onConfirm={confirmDelete}
		onCancel={() => (confirmDeleteOpen = false)}
	/>
{/if}
