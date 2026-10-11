<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
		hideSubtitleOnMobile?: boolean;
		/** `on-chrome` lifts the subtitle to the muted chrome tone for a wordmark sitting on the dark app chrome. */
		variant?: 'default' | 'on-chrome';
	}

	let { class: className, hideSubtitleOnMobile = false, variant = 'default' }: Props = $props();
</script>

<div class={className}>
	<div class="font-heading text-[22px] leading-none font-extrabold tracking-[0.02em] max-sm:text-[18px]">
		Troop<span class="text-accent">To</span>Task
	</div>
	<div
		class={cn(
			'mt-1 font-mono text-[10px] font-medium tracking-[0.14em] uppercase',
			variant === 'on-chrome' ? 'text-chrome-text-muted' : 'text-muted-foreground',
			hideSubtitleOnMobile && 'max-sm:hidden'
		)}
	>
		Unit Readiness Platform
	</div>
</div>
