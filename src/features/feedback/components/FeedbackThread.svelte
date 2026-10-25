<script lang="ts">
	import type { FeedbackReply } from '../contracts';

	interface Props {
		replies: FeedbackReply[];
		/** Who the replies are from, as the reader should hear it: "You" for the operator, "TroopToTask" for the reporter. */
		from: string;
		formatSent: (sentAt: string) => string;
	}

	let { replies, from, formatSent }: Props = $props();
</script>

<ol class="grid gap-3" aria-label="Replies">
	{#each replies as reply (reply.id)}
		<li class="grid gap-1.5 border-l-2 border-foreground py-0.5 pl-[18px]">
			<p class="font-mono text-[11px] leading-4 tracking-[0.04em] text-muted-foreground uppercase">
				{from} · {formatSent(reply.sentAt)}
			</p>
			<p class="text-base leading-[25px] break-words whitespace-pre-wrap">{reply.body}</p>
		</li>
	{/each}
</ol>
