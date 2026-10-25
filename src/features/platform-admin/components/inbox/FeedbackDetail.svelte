<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy, onMount } from 'svelte';
	import { FeedbackThread } from '$features/feedback';
	import type { FeedbackIssue, FeedbackStaffResult } from '$features/feedback/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { feedbackTitle } from '../../inboxTypes';
	import { formatAdminLabel } from '../adminTheme';
	import { createFeedbackStaff } from './feedbackStaff.svelte';
	import FeedbackIssueDialog from './FeedbackIssueDialog.svelte';
	import { createInboxActions } from './inboxActions.svelte';
	import InboxDetailHeader from './InboxDetailHeader.svelte';
	import type { InboxDetailProps } from './inboxDetailProps';
	import { formatWhen } from './inboxFormat';

	let { detail, onChanged }: InboxDetailProps<'feedback'> = $props();

	const actions = createInboxActions(() => onChanged());
	const staff = createFeedbackStaff(() => detail.id);
	onMount(() => void staff.load());
	onDestroy(() => {
		actions.dispose();
		staff.dispose();
	});

	const now = new Date();
	const isOpen = $derived(detail.status !== 'resolved');
	const title = $derived(feedbackTitle(detail.message));
	const meta = $derived(
		[
			detail.person,
			detail.organizationName,
			detail.pageSection && `on ${detail.pageSection}`,
			formatWhen(detail.receivedAt, now)
		]
			.filter(Boolean)
			.join(' · ')
	);
	const context = $derived([
		{ label: 'Page', value: detail.pageUrl ?? 'Not recorded' },
		...(detail.closedAt ? [{ label: 'Closed', value: formatWhen(detail.closedAt, now) }] : [])
	]);

	const view = $derived(staff.region);
	const held = $derived(staff.uncertain);
	const busy = $derived(staff.pending !== null || held || actions.pending !== null);
	const sending = $derived(staff.pending === 'reply' || staff.pending === 'replyAndClose');

	let draft = $state('');
	let replyError = $state<string | null>(null);
	let replyClosed = $state(false);
	let notice = $state<string | null>(null);

	let noteDraft = $state<string | null>(null);
	let noteError = $state<string | null>(null);
	let noteSaved = $state(false);
	const noteBaseline = $derived(view.status === 'ok' ? (view.detail.staffNotes[0]?.body ?? '') : '');
	const noteText = $derived(noteDraft ?? noteBaseline);
	const noteDirty = $derived(noteText.trim() !== noteBaseline.trim());

	let issueOpen = $state(false);
	let issueError = $state<string | null>(null);
	let unlinked = $state<FeedbackIssue | null>(null);

	type Refusal = Exclude<FeedbackStaffResult, { status: 'replied' | 'noteSaved' | 'issueCreated' }>;
	const REFUSALS: Record<Refusal['status'], string> = {
		notFound: 'This feedback no longer exists.',
		issueExists: 'This feedback already has a GitHub issue.',
		closed: 'This feedback was closed. Reload to see it.',
		githubError: 'GitHub did not create the issue.',
		issuePersistenceError: 'GitHub created the issue, but its link was not saved.'
	};

	async function sendReply(kind: 'reply' | 'replyAndClose') {
		const body = draft.trim();
		if (!body || busy) return;
		replyError = null;
		replyClosed = false;
		notice = null;
		const outcome = await staff.send({ kind, body });
		if (outcome.type === 'ignored') return;
		if (outcome.type === 'accepted') {
			draft = '';
			notice = kind === 'reply' ? 'Reply sent. They will see it in the app.' : 'Reply sent and the item is closed.';
		} else if (outcome.type === 'failed') replyError = outcome.message;
		else {
			replyError = REFUSALS[outcome.result.status];
			replyClosed = outcome.result.status === 'closed';
		}
		// A refusal for a closed item leaves the draft in place until the operator chooses to reload.
		if (!replyClosed) onChanged();
	}

	function reloadClosed() {
		replyError = null;
		replyClosed = false;
		onChanged();
	}

	async function saveNote() {
		if (!noteDirty || busy) return;
		noteError = null;
		noteSaved = false;
		const text = noteText.trim();
		const outcome = await staff.send({ kind: 'saveNote', body: text });
		if (outcome.type === 'ignored') return;
		if (outcome.type === 'accepted') {
			noteDraft = text;
			noteSaved = true;
		} else {
			noteError = outcome.type === 'failed' ? outcome.message : REFUSALS[outcome.result.status];
		}
	}

	async function createIssue(issue: { title: string; description: string; includeOrganization: boolean }) {
		if (busy) return;
		issueError = null;
		const outcome = await staff.send({ kind: 'makeGitHubIssue', ...issue });
		if (outcome.type === 'ignored') return;
		if (outcome.type === 'accepted') {
			issueOpen = false;
			if (outcome.result.status === 'issueCreated')
				notice = `GitHub issue #${outcome.result.issue.issueNumber} created.`;
		} else if (outcome.type === 'refused') {
			const { result } = outcome;
			if (result.status === 'githubError') issueError = result.message;
			else if (result.status === 'issuePersistenceError') {
				issueError = result.message;
				unlinked = result.issue;
			} else {
				issueOpen = false;
				notice = REFUSALS[result.status];
			}
		} else issueError = outcome.message;
	}

	function closeIssueDialog() {
		issueOpen = false;
		issueError = null;
	}
</script>

{#snippet closeForm()}
	{#if isOpen}
		<form method="POST" action="?/close" use:enhance={actions.enhanceFor('close')}>
			<input type="hidden" name="id" value={detail.id} />
			<Button
				type="submit"
				variant="ghost"
				disabled={staff.pending !== null || held}
				aria-disabled={actions.pending === 'close' ? 'true' : undefined}
				aria-busy={actions.pending === 'close' || undefined}
			>
				{#if actions.pending === 'close'}<Spinner />{/if}
				Close without replying
			</Button>
		</form>
	{/if}
{/snippet}

<article class="grid max-w-[640px] gap-[22px]">
	<InboxDetailHeader
		tone="info"
		eyebrow={`Feedback · ${formatAdminLabel(detail.category)}`}
		badges={isOpen ? [] : [{ label: 'Closed', variant: 'success' }]}
		{title}
		{meta}
	/>

	{#if detail.message.trim() !== title}
		<p class="text-base leading-[25px] break-words whitespace-pre-wrap">{detail.message}</p>
	{/if}

	<dl
		class="flex flex-wrap gap-x-7 gap-y-1 border-y border-border py-2.5 font-mono text-[11px] leading-4 tracking-[0.04em]"
	>
		{#each context as fact (fact.label)}
			<div class="flex min-w-0 gap-1.5">
				<dt class="uppercase">{fact.label}</dt>
				<dd class="break-all text-muted-foreground">{fact.value}</dd>
			</div>
		{/each}
	</dl>

	{#if actions.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{actions.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if view.status === 'loading'}
		<div class="grid gap-[22px]" role="status" aria-label="Loading replies and notes">
			<div class="grid gap-2">
				<Skeleton class="h-4 w-40" />
				<Skeleton class="h-24 w-full" />
			</div>
			<div class="flex gap-2">
				<Skeleton class="h-8 w-28" />
				<Skeleton class="h-8 w-32" />
				<Skeleton class="h-8 w-44" />
			</div>
			<div class="grid gap-2 border-t border-border pt-5">
				<Skeleton class="h-4 w-32" />
				<Skeleton class="h-16 w-full" />
			</div>
		</div>
	{:else if view.status === 'error'}
		<Alert.Root variant="destructive">
			<Alert.Description>The replies and notes for this feedback could not be loaded.</Alert.Description>
			<Button class="mt-1 w-fit" variant="outline" onclick={() => void staff.load()}>Try again</Button>
		</Alert.Root>
		{@render closeForm()}
	{:else if view.status === 'notFound'}
		<Alert.Root>
			<Alert.Description>{REFUSALS.notFound}</Alert.Description>
		</Alert.Root>
	{:else}
		{@const issue = view.detail.issue}
		{#if staff.reloadFailed}
			<Alert.Root variant="destructive">
				<Alert.Description>The replies and notes could not be reloaded, so they may be out of date.</Alert.Description>
				<Button class="mt-1 w-fit" variant="outline" onclick={() => void staff.load(true)}>Try again</Button>
			</Alert.Root>
		{/if}

		{#if view.detail.replies.length > 0}
			<section class="grid gap-2.5">
				<h3 class="font-mono text-[11px] leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					Replies
				</h3>
				<FeedbackThread replies={view.detail.replies} from="You" formatSent={(sentAt) => formatWhen(sentAt, now)} />
			</section>
		{/if}

		{#if isOpen}
			<form
				id="feedback-reply-form"
				class="grid gap-2"
				onsubmit={(event) => {
					event.preventDefault();
					void sendReply('reply');
				}}
			>
				<Field.Root>
					<Field.Label for="feedback-reply">Reply to {detail.person}</Field.Label>
					<Field.Control>
						<Textarea
							id="feedback-reply"
							rows={4}
							maxlength={5000}
							readonly={sending}
							aria-busy={sending || undefined}
							bind:value={draft}
						/>
					</Field.Control>
				</Field.Root>
			</form>
		{/if}

		{#if notice}
			<Alert.Root role="status">
				<Alert.Description>{notice}</Alert.Description>
			</Alert.Root>
		{/if}
		{#if replyError}
			<Alert.Root variant="destructive">
				<Alert.Description>{replyError}</Alert.Description>
				{#if replyClosed}
					<Button class="mt-1 w-fit" variant="outline" onclick={reloadClosed}>Reload</Button>
				{/if}
			</Alert.Root>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			{#if isOpen}
				<Button
					type="submit"
					form="feedback-reply-form"
					disabled={!draft.trim() || (busy && staff.pending !== 'reply')}
					aria-disabled={staff.pending === 'reply' ? 'true' : undefined}
					aria-busy={staff.pending === 'reply' || undefined}
				>
					{#if staff.pending === 'reply'}<Spinner />{/if}
					Send reply
				</Button>
				<Button
					variant="outline"
					disabled={!draft.trim() || (busy && staff.pending !== 'replyAndClose')}
					aria-disabled={staff.pending === 'replyAndClose' ? 'true' : undefined}
					aria-busy={staff.pending === 'replyAndClose' || undefined}
					onclick={() => void sendReply('replyAndClose')}
				>
					{#if staff.pending === 'replyAndClose'}<Spinner />{/if}
					Reply and close
				</Button>
			{/if}
			{#if issue}
				<Button variant="outline" href={issue.issueUrl} target="_blank" rel="noreferrer">
					GitHub issue #{issue.issueNumber}
				</Button>
			{:else if unlinked}
				<Button variant="outline" href={unlinked.issueUrl} target="_blank" rel="noreferrer">
					GitHub issue #{unlinked.issueNumber}
				</Button>
			{:else}
				<Button variant="outline" disabled={busy} onclick={() => (issueOpen = true)}>Make it a GitHub issue</Button>
			{/if}
			<div class="sm:ml-auto">{@render closeForm()}</div>
		</div>
		{#if isOpen}
			<p class="text-[13px] leading-[19px] text-muted-foreground">
				They see your reply as an in-app notification, next to what they sent. No email. Sending a reply keeps the item
				open until you close it.
			</p>
		{/if}
		{#if unlinked && !issueOpen}
			<Alert.Root variant="destructive">
				<Alert.Description>
					GitHub created issue #{unlinked.issueNumber}, but this feedback did not save its link. Use that issue instead
					of creating another.
				</Alert.Description>
			</Alert.Root>
		{/if}

		<section class="grid gap-2.5 border-t border-border pt-5">
			<div class="flex flex-wrap items-center gap-2.5">
				<h3 class="font-mono text-[11px] leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					Staff notes
				</h3>
				<Badge variant="outline">Private</Badge>
			</div>
			<Field.Root>
				<Field.Label for="feedback-note" class="sr-only">Staff note</Field.Label>
				<Field.Control>
					<Textarea
						id="feedback-note"
						rows={3}
						maxlength={5000}
						readonly={staff.pending === 'saveNote'}
						value={noteText}
						oninput={(event) => {
							noteDraft = event.currentTarget.value;
							noteSaved = false;
						}}
					/>
				</Field.Control>
				<Field.Description>
					Only you can see this. The person who sent the feedback never does, and it is not in the replies.
				</Field.Description>
			</Field.Root>
			<div class="flex flex-wrap items-center gap-3">
				<Button
					variant="outline"
					disabled={!noteDirty || (busy && staff.pending !== 'saveNote')}
					aria-disabled={staff.pending === 'saveNote' ? 'true' : undefined}
					aria-busy={staff.pending === 'saveNote' || undefined}
					onclick={() => void saveNote()}
				>
					{#if staff.pending === 'saveNote'}<Spinner />{/if}
					Save note
				</Button>
				{#if noteSaved}
					<p class="text-[13px] text-muted-foreground" role="status">Note saved.</p>
				{/if}
			</div>
			{#if noteError}
				<Alert.Root variant="destructive">
					<Alert.Description>{noteError}</Alert.Description>
				</Alert.Root>
			{/if}
		</section>
	{/if}
</article>

{#if issueOpen && view.status === 'ok'}
	<FeedbackIssueDialog
		prefill={view.detail.issuePrefill}
		organizationName={detail.organizationName}
		pending={staff.pending === 'makeGitHubIssue'}
		{held}
		error={issueError}
		{unlinked}
		onSubmit={createIssue}
		onClose={closeIssueDialog}
	/>
{/if}
