<script lang="ts" module>
	export type AttentionTone = 'danger' | 'warning' | 'info';

	const TONE_VISUALS: Record<AttentionTone, { rule: string; text: string }> = {
		danger: { rule: 'border-l-destructive', text: 'text-destructive' },
		warning: { rule: 'border-l-accent', text: 'text-accent-text' },
		info: { rule: 'border-l-border', text: 'text-muted-foreground' }
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { cn } from '$lib/utils.js';

	interface Props {
		tone: AttentionTone;
		label: string;
		title: string;
		subtitle: string;
		timing: string;
		/** The owning page at this record; the whole row opens it. */
		href: string;
		/** Buttons that act in place, beside the chevron. */
		action?: Snippet;
		/** An expanded panel under the row, inside the same rule. */
		children?: Snippet;
	}

	let { tone, label, title, subtitle, timing, href, action, children }: Props = $props();

	const visual = $derived(TONE_VISUALS[tone]);
</script>

<li class={cn('border-b border-l-[3px] border-b-border', visual.rule)}>
	<div
		class="relative grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 pl-4 hover:bg-muted/60 has-[a:focus-visible]:bg-muted/60 sm:grid-cols-[84px_minmax(0,1fr)_96px_172px]"
	>
		<span class={cn('font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] uppercase', visual.text)}>
			{label}
		</span>
		<span class="grid min-w-0 gap-[3px] max-sm:order-3">
			<span class="text-base leading-[22px] font-semibold text-foreground">{title}</span>
			<span class="text-sm leading-5 text-muted-foreground">{subtitle}</span>
		</span>
		<span class={cn('text-right font-mono text-xs leading-4 whitespace-nowrap max-sm:order-2', visual.text)}>{timing}</span>
		<span class="flex items-center justify-end gap-1.5 max-sm:order-4">
			{#if action}
				<span class="relative z-10 flex gap-1.5">{@render action()}</span>
			{/if}
			<a
				{href}
				aria-label={title}
				class="flex h-8 w-7 items-center justify-center rounded-md text-muted-foreground after:absolute after:inset-0 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				<ChevronRightIcon class="size-3.5" aria-hidden="true" />
			</a>
		</span>
	</div>
	{@render children?.()}
</li>
