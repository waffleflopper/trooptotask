<script lang="ts">
	import { onDestroy } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import { FeedbackThread, FEEDBACK_CATEGORY_LABELS, REPORTER_FEEDBACK_STATUS } from '$features/feedback';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { settleAction } from '$lib/utils/settleAction';
	import type { ReporterFeedback } from '$features/feedback/contracts';

	let { feedback }: { feedback: ReporterFeedback } = $props();
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const status = $derived(REPORTER_FEEDBACK_STATUS[feedback.status]);
	let draft = $state('');
	let sending = $state(false);
	let replyError = $state<string | null>(null);
	let replyField = $state<HTMLTextAreaElement | null>(null);

	const sendReply: SubmitFunction = ({ cancel }) => {
		if (sending || !draft.trim()) return cancel();
		const feedbackId = feedback.id;
		const isCurrent = () => active && feedback.id === feedbackId;
		sending = true;
		replyError = null;
		return async (outcome) => {
			await settleAction(outcome, {
				isCurrent,
				settled: (error) => {
					sending = false;
					replyError = error ?? (outcome.result.type === 'failure' ? (outcome.result.data?.message ?? null) : null);
					if (outcome.result.type === 'success') draft = '';
				},
				focus: () => [replyField],
				reset: false
			});
			// A refusal because the item closed meanwhile swaps the composer for the closed notice.
			if (isCurrent() && outcome.result.type === 'failure' && outcome.result.status === 409) await invalidateAll();
		};
	};
</script>

<div class="grid gap-7">
	<PageShell.Header
		eyebrow={`Your feedback · ${FEEDBACK_CATEGORY_LABELS[feedback.category]}`}
		title="What you sent"
		variant="display"
	>
		{#snippet subtitle()}
			<span class="flex flex-wrap items-center gap-2.5">
				<Badge variant={status.variant}>{status.label}</Badge>
				<span class="font-mono text-xs">Sent {formatDisplayDateTime(feedback.createdAt)}</span>
			</span>
		{/snippet}
	</PageShell.Header>

	<p class="border-t-2 border-foreground pt-5 text-base leading-[25px] break-words whitespace-pre-wrap">
		{feedback.message}
	</p>

	<section class="grid gap-3 border-t border-border pt-5" aria-labelledby="replies-heading">
		<h2 id="replies-heading" class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
			Conversation
		</h2>
		{#if feedback.replies.length > 0}
			<FeedbackThread
				replies={feedback.replies}
				labels={{ operator: 'TroopToTask', reporter: 'You' }}
				formatSent={formatDisplayDateTime}
			/>
		{:else}
			<p class="text-sm text-muted-foreground">
				No reply yet. When there is one, it appears here and in your notifications.
			</p>
		{/if}
	</section>

	{#if feedback.status === 'resolved'}
		<p class="border-t border-border pt-5 text-sm text-muted-foreground">
			This feedback is closed, so it takes no more replies. Use Send feedback in the account menu to tell us something
			new.
		</p>
	{:else}
		<form method="POST" action="?/reply" class="grid gap-3 border-t border-border pt-5" use:enhance={sendReply}>
			<Field.Root data-invalid={replyError ? true : undefined}>
				<Field.Label for="feedback-reply">Reply</Field.Label>
				<Field.Control>
					<Textarea
						bind:ref={replyField}
						bind:value={draft}
						id="feedback-reply"
						name="body"
						rows={4}
						maxlength={5000}
						readonly={sending}
						aria-invalid={replyError ? true : undefined}
					/>
				</Field.Control>
				<Field.Description>Add detail or answer a question. We see it in our inbox.</Field.Description>
				{#if replyError}
					<Field.Error>{replyError}</Field.Error>
				{/if}
			</Field.Root>
			<Button type="submit" class="w-fit" disabled={!draft.trim() && !sending} aria-busy={sending || undefined}>
				{#if sending}<Spinner />{/if}
				{sending ? 'Sending...' : 'Send reply'}
			</Button>
		</form>
	{/if}
</div>
