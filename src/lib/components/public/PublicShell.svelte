<script lang="ts">
	import type { Snippet } from 'svelte';
	import PublicCta from './PublicCta.svelte';
	import PublicFooter from './PublicFooter.svelte';
	import PublicSiteNav from './PublicSiteNav.svelte';

	interface Props {
		user?: unknown;
		active?: 'features' | 'pricing' | 'security';
		bodyClass?: string;
		roadmapHref?: string;
		faqHref?: string;
		showFaqLink?: boolean;
		showClassificationBar?: boolean;
		showCta?: boolean;
		showFooter?: boolean;
		ctaTitleBefore?: string;
		ctaEmphasis?: string;
		ctaSubtitle?: string;
		navOverlay?: boolean;
		navScrolled?: boolean;
		children: Snippet;
		cta?: Snippet;
	}

	let {
		user,
		active,
		bodyClass = '',
		roadmapHref = '/#roadmap',
		faqHref = '/#faq',
		showFaqLink = false,
		showClassificationBar = true,
		showCta = true,
		showFooter = true,
		ctaTitleBefore = 'Ready to streamline',
		ctaEmphasis = 'your unit?',
		ctaSubtitle = 'Free to use. No credit card. Set up in minutes.',
		navOverlay = false,
		navScrolled = false,
		children,
		cta
	}: Props = $props();
</script>

<div class="public-shell">
	{#if showClassificationBar}
		<div class="classification-bar">
			<span>TROOP TO TASK</span>
			<span class="classification-sep">//</span>
			<span>PERSONNEL MANAGEMENT SYSTEM</span>
		</div>
	{/if}

	<PublicSiteNav {user} {active} {roadmapHref} {faqHref} {showFaqLink} overlay={navOverlay} scrolled={navScrolled} />

	<main class={`public-body ${bodyClass}`.trim()}>
		{@render children()}
	</main>

	{#if showCta}
		{#if cta}
			{@render cta()}
		{:else}
			<PublicCta {user} titleBefore={ctaTitleBefore} emphasis={ctaEmphasis} subtitle={ctaSubtitle} />
		{/if}
	{/if}

	{#if showFooter}
		<PublicFooter />
	{/if}
</div>

<style>
	.public-shell {
		--brass: var(--accent);
		--brass-light: var(--accent);
		--brass-muted: color-mix(in srgb, var(--accent) 14%, transparent);
		--font-family: 'Source Serif 4', serif;
		--font-size-base: 1rem;
		--public-ink: var(--color-chrome);
		--public-ink-light: color-mix(in srgb, var(--color-chrome) 86%, var(--card) 14%);
		--public-ink-border: var(--color-chrome-border);
		--public-paper: var(--card);
		--public-paper-warm: color-mix(in srgb, var(--card) 78%, var(--muted) 22%);
		--hero-bg: var(--foreground);
		--hero-text: var(--color-chrome-text);
		--hero-muted: var(--color-chrome-text-muted);
		--classification-bg: color-mix(in srgb, var(--muted) 88%, var(--background) 12%);
		--classification-text: var(--muted-foreground);
		--classification-border: var(--border);
		min-height: 100vh;
		background: var(--background);
		color: var(--foreground);
		font-family: 'Source Serif 4', serif;
		font-size: 1rem;
		font-weight: 300;
		line-height: 1.65;
		overflow-x: hidden;
	}

	:global([data-theme='dark']) .public-shell {
		--public-paper: var(--card);
		--public-paper-warm: color-mix(in srgb, var(--card) 82%, black 18%);
		--classification-bg: var(--foreground);
		--classification-text: var(--hero-muted);
		--classification-border: var(--public-ink-border);
	}

	.classification-bar {
		background: var(--classification-bg);
		color: var(--classification-text);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.15em;
		line-height: 1.4;
		text-align: center;
		text-transform: uppercase;
		padding: 0.375rem 1rem;
		border-bottom: 1px solid var(--classification-border);
	}

	.classification-sep {
		color: var(--brass);
		margin: 0 0.75rem;
	}

	.public-body {
		min-height: 0;
	}

	@media (max-width: 640px) {
		.classification-bar {
			font-size: 0.6rem;
			padding-inline: 0.75rem;
		}
	}
</style>
