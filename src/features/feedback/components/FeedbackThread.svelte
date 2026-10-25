<script lang="ts">
	import type { FeedbackAuthor, FeedbackReply } from '../contracts';

	interface Props {
		replies: FeedbackReply[];
		/** Each side's name as the reader should hear it, such as "You" for the reader's own side. */
		labels: Record<FeedbackAuthor, string>;
		formatSent: (sentAt: string) => string;
	}

	let { replies, labels, formatSent }: Props = $props();

	const TONE: Record<FeedbackAuthor, { rule: string; name: string }> = {
		operator: { rule: 'border-foreground', name: 'text-foreground' },
		reporter: { rule: 'border-accent', name: 'text-accent-text' }
	};
</script>

<ol class="grid gap-3" aria-label="Replies">
	{#each replies as reply (reply.id)}
		<li class="grid gap-1.5 border-l-2 py-0.5 pl-[18px] {TONE[reply.author].rule}">
			<p class="font-mono text-[11px] leading-4 tracking-[0.04em] text-muted-foreground uppercase">
				<span class="font-semibold {TONE[reply.author].name}">{labels[reply.author]}</span> · {formatSent(reply.sentAt)}
			</p>
			<p class="text-base leading-[25px] break-words whitespace-pre-wrap">{reply.body}</p>
		</li>
	{/each}
</ol>
