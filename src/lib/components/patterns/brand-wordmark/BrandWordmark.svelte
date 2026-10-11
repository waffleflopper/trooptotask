<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
		titleClass?: string;
		subtitleClass?: string;
		hideSubtitleOnMobile?: boolean;
		/** `on-chrome` lifts the subtitle to the muted chrome tone for a wordmark sitting on the dark app chrome. */
		variant?: 'default' | 'on-chrome';
	}

	let {
		class: className,
		titleClass,
		subtitleClass,
		hideSubtitleOnMobile = false,
		variant = 'default'
	}: Props = $props();
</script>

<div class={cn('brand-wordmark', className)}>
	<div class={cn('brand-wordmark__wordmark', titleClass)}>Troop<span>To</span>Task</div>
	<div
		class={cn(
			'brand-wordmark__subtitle',
			hideSubtitleOnMobile && 'brand-wordmark__subtitle--mobile-hidden',
			variant === 'on-chrome' && 'brand-wordmark__subtitle--on-chrome',
			subtitleClass
		)}
	>
		Unit Readiness Platform
	</div>
</div>

<style>
	.brand-wordmark {
		color: inherit;
	}

	.brand-wordmark__wordmark {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: var(--public-brand-title-size, 22px);
		font-weight: 800;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.brand-wordmark__wordmark span {
		color: var(--public-brand-accent, var(--accent));
	}

	.brand-wordmark__subtitle {
		margin-top: 0.25rem;
		color: var(--public-brand-subtitle-color, var(--muted-foreground));
		font-family: 'IBM Plex Mono', monospace;
		font-size: var(--public-brand-subtitle-size, 10px);
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.brand-wordmark__subtitle--on-chrome {
		color: var(--color-chrome-text-muted);
	}

	@media (max-width: 640px) {
		.brand-wordmark__wordmark {
			font-size: var(--public-brand-title-size-mobile, 18px);
		}

		.brand-wordmark__subtitle--mobile-hidden {
			display: none;
		}
	}
</style>
