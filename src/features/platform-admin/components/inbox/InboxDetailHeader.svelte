<script lang="ts">
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import { INBOX_TONES, type InboxTone } from './inboxTones';

	interface Props {
		tone: InboxTone;
		eyebrow: string;
		badges?: { label: string; variant: BadgeVariant }[];
		title: string;
		/** The mono line under the title: who, and when. */
		meta: string;
	}

	let { tone, eyebrow, badges = [], title, meta }: Props = $props();
</script>

<header class="grid gap-2">
	<div class="flex flex-wrap items-center gap-2.5">
		<p
			class={cn(
				'font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] uppercase',
				INBOX_TONES[tone].text
			)}
		>
			{eyebrow}
		</p>
		{#each badges as badge (badge.label)}
			<Badge variant={badge.variant}>{badge.label}</Badge>
		{/each}
	</div>
	<h2
		class="font-heading text-[34px] leading-9 font-bold break-words text-foreground max-sm:text-[28px] max-sm:leading-8"
	>
		{title}
	</h2>
	<p class="font-mono text-xs break-words text-muted-foreground">{meta}</p>
</header>
