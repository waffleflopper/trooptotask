<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
		titleClass?: string;
		subtitleClass?: string;
		hideSubtitleOnMobile?: boolean;
	}

	let { class: className, titleClass, subtitleClass, hideSubtitleOnMobile = false }: Props = $props();
</script>

<div class={cn('public-brand-mark', className)}>
	<div class={cn('public-brand-mark__wordmark', titleClass)}>Troop<span>To</span>Task</div>
	<div
		class={cn(
			'public-brand-mark__subtitle',
			hideSubtitleOnMobile && 'public-brand-mark__subtitle--mobile-hidden',
			subtitleClass
		)}
	>
		Unit Readiness Platform
	</div>
</div>

<style>
	.public-brand-mark {
		color: inherit;
	}

	.public-brand-mark__wordmark {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: var(--public-brand-title-size, 22px);
		font-weight: 800;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.public-brand-mark__wordmark span {
		color: var(--public-brand-accent, var(--accent));
	}

	.public-brand-mark__subtitle {
		margin-top: 0.25rem;
		color: var(--public-brand-subtitle-color, var(--muted-foreground));
		font-family: 'IBM Plex Mono', monospace;
		font-size: var(--public-brand-subtitle-size, 10px);
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	@media (max-width: 640px) {
		.public-brand-mark__wordmark {
			font-size: var(--public-brand-title-size-mobile, 18px);
		}

		.public-brand-mark__subtitle--mobile-hidden {
			display: none;
		}
	}
</style>
