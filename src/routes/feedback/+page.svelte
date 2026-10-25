<script lang="ts">
	import { resolve } from '$app/paths';
	import type { FeedbackStatus } from '$features/feedback/contracts';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { formatDisplayDate } from '$lib/utils/dates';

	let { data } = $props();

	const CATEGORY_LABELS = { bug: 'Bug report', feature: 'Feature request', general: 'General feedback' } as const;
	const STATUS: Record<FeedbackStatus, { label: string; variant: BadgeVariant }> = {
		new: { label: 'Received', variant: 'secondary' },
		reviewed: { label: 'In review', variant: 'info' },
		resolved: { label: 'Closed', variant: 'success' }
	};

	const firstLine = (message: string) => message.trim().split(/\r?\n/, 1)[0] ?? '';
	const repliesLabel = (count: number) => `${count} ${count === 1 ? 'reply' : 'replies'}`;
	const threadHref = (id: string) => resolve(`/feedback/${id}` as `/feedback/${string}`);
</script>

<svelte:head>
	<title>Your feedback - Troop to Task</title>
</svelte:head>

<main class="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-12">
	<div class="mx-auto grid max-w-[640px] gap-7">
		<nav class="font-mono text-xs tracking-[0.08em] uppercase" aria-label="Feedback">
			<a class="text-primary underline-offset-4 hover:underline" href={resolve('/dashboard')}>Back to the app</a>
		</nav>

		<header class="grid gap-2">
			<p class="font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-info-foreground uppercase">
				Feedback
			</p>
			<h1 class="font-heading text-[34px] leading-9 font-bold text-foreground max-sm:text-[28px] max-sm:leading-8">
				Your feedback
			</h1>
		</header>

		{#if data.feedback.length > 0}
			<ul class="border-t border-border">
				{#each data.feedback as item (item.id)}
					<li class="border-b border-border">
						<a
							class="grid gap-1 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
							href={threadHref(item.id)}
						>
							<span class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
								{CATEGORY_LABELS[item.category]} · {formatDisplayDate(item.createdAt)}
							</span>
							<span class="text-base leading-6 break-words text-foreground">{firstLine(item.message)}</span>
							<span class="flex flex-wrap items-center gap-2">
								<Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge>
								{#if item.replyCount > 0}
									<span class="font-mono text-xs text-muted-foreground">{repliesLabel(item.replyCount)}</span>
								{/if}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm leading-[21px] text-muted-foreground">
				You have not sent any feedback. Use Send feedback in the app to tell us what is working and what is not.
			</p>
		{/if}
	</div>
</main>
