<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
		hideSubtitleOnMobile?: boolean;
		/**
		 * `on-chrome` lifts the subtitle to the muted chrome tone for a wordmark sitting on the dark app chrome.
		 * `platform` marks the operator's admin on the chrome with an accent "Platform" subtitle.
		 */
		variant?: 'default' | 'on-chrome' | 'platform';
	}

	let { class: className, hideSubtitleOnMobile = false, variant = 'default' }: Props = $props();

	const subtitleTone = {
		default: 'text-muted-foreground',
		'on-chrome': 'text-chrome-text-muted',
		platform: 'text-chrome-accent'
	} as const;
</script>

<div class={className}>
	<div class="font-heading text-[22px] leading-none font-extrabold tracking-[0.02em] max-sm:text-[18px]">
		Troop<span class="text-accent">To</span>Task
	</div>
	<div
		class={cn(
			'mt-1 font-mono text-[10px] font-medium tracking-[0.14em] uppercase',
			subtitleTone[variant],
			hideSubtitleOnMobile && 'max-sm:hidden'
		)}
	>
		{variant === 'platform' ? 'Platform' : 'Unit Readiness Platform'}
	</div>
</div>
