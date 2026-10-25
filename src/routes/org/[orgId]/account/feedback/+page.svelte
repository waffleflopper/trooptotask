<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAppShellContext } from '$features/app-shell';
	import { FEEDBACK_CATEGORY_LABELS, REPORTER_FEEDBACK_STATUS } from '$features/feedback';
	import { ACCOUNT_PAGES } from '$features/identity/AccountShell.svelte';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { formatDisplayDate } from '$lib/utils/dates';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const shell = getAppShellContext();

	const firstLine = (message: string) => message.trim().split(/\r?\n/, 1)[0] ?? '';
	const repliesLabel = (count: number) => `${count} ${count === 1 ? 'reply' : 'replies'}`;
</script>

<div class="grid gap-7">
	<PageShell.Header
		eyebrow="Account · Only you"
		title={ACCOUNT_PAGES.feedback.label}
		variant="display"
		subtitle={ACCOUNT_PAGES.feedback.subtitle}
	/>

	{#if data.feedback === null}
		<Alert.Root variant="destructive">
			<Alert.Title>Unable to load feedback</Alert.Title>
			<Alert.Description>Your feedback could not be loaded. Try again.</Alert.Description>
			<Alert.Action>
				<Button type="button" variant="outline" size="sm" onclick={() => invalidateAll()}>Retry</Button>
			</Alert.Action>
		</Alert.Root>
	{:else if data.feedback.length > 0}
		<ul class="border-t-2 border-foreground">
			{#each data.feedback as item (item.id)}
				{@const status = REPORTER_FEEDBACK_STATUS[item.status]}
				<li class="border-b border-border">
					<a
						class="grid gap-2 py-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
						href={resolve(`/org/${shell.orgUrlSegment}/account/feedback/${item.id}`)}
					>
						<span class="font-mono text-[11px] leading-4 tracking-[0.08em] text-muted-foreground uppercase">
							{FEEDBACK_CATEGORY_LABELS[item.category]} · {formatDisplayDate(item.createdAt)}
						</span>
						<span class="text-base leading-6 break-words text-foreground">{firstLine(item.message)}</span>
						<span class="flex flex-wrap items-center gap-2">
							<Badge variant={status.variant}>{status.label}</Badge>
							{#if item.replyCount > 0}
								<span class="font-mono text-xs text-muted-foreground">{repliesLabel(item.replyCount)}</span>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="border-t-2 border-foreground pt-5 text-sm text-muted-foreground">
			You have not sent any feedback. Use Send feedback in the account menu to tell us what works and what does not.
		</p>
	{/if}
</div>
