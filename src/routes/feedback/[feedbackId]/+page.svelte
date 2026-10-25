<script lang="ts">
	import { resolve } from '$app/paths';
	import { FeedbackThread } from '$features/feedback';
	import type { FeedbackStatus } from '$features/feedback/contracts';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	const CATEGORY_LABELS = { bug: 'Bug report', feature: 'Feature request', general: 'General feedback' } as const;
	const STATUS: Record<FeedbackStatus, { label: string; variant: BadgeVariant }> = {
		new: { label: 'Received', variant: 'secondary' },
		reviewed: { label: 'In review', variant: 'info' },
		resolved: { label: 'Closed', variant: 'success' }
	};

	const feedback = $derived(data.feedback);
	const status = $derived(STATUS[feedback.status]);
</script>

<svelte:head>
	<title>Your feedback - Troop to Task</title>
</svelte:head>

<main class="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-12">
	<div class="mx-auto grid max-w-[640px] gap-7">
		<nav class="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tracking-[0.08em] uppercase" aria-label="Feedback">
			<a class="text-primary underline-offset-4 hover:underline" href={resolve('/dashboard')}>Back to the app</a>
			<a class="text-muted-foreground underline-offset-4 hover:underline" href={resolve('/feedback')}
				>All your feedback</a
			>
		</nav>

		<header class="grid gap-2">
			<p class="font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-info-foreground uppercase">
				Your feedback · {CATEGORY_LABELS[feedback.category]}
			</p>
			<h1 class="font-heading text-[34px] leading-9 font-bold text-foreground max-sm:text-[28px] max-sm:leading-8">
				What you sent
			</h1>
			<div class="flex flex-wrap items-center gap-2.5">
				<Badge variant={status.variant}>{status.label}</Badge>
				<p class="font-mono text-xs text-muted-foreground">Sent {formatDisplayDateTime(feedback.createdAt)}</p>
			</div>
		</header>

		<p class="text-base leading-[25px] break-words whitespace-pre-wrap">{feedback.message}</p>

		<section class="grid gap-3 border-t border-border pt-5" aria-labelledby="replies-heading">
			<h2
				id="replies-heading"
				class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
			>
				Replies
			</h2>
			{#if feedback.replies.length > 0}
				<FeedbackThread replies={feedback.replies} from="TroopToTask" formatSent={formatDisplayDateTime} />
			{:else}
				<p class="text-sm leading-[21px] text-muted-foreground">
					No reply yet. When there is one, it appears here and in your notifications.
				</p>
			{/if}
		</section>
	</div>
</main>
