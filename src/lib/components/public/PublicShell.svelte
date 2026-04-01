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
		showCta?: boolean;
		ctaTitleBefore?: string;
		ctaEmphasis?: string;
		ctaSubtitle?: string;
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
		showCta = true,
		ctaTitleBefore = 'Ready to streamline',
		ctaEmphasis = 'your unit?',
		ctaSubtitle = 'Free to use. No credit card. Set up in minutes.',
		children,
		cta
	}: Props = $props();
</script>

<div class="public-shell">
	<div class="classification-bar">
		<span>TROOP TO TASK</span>
		<span class="classification-sep">//</span>
		<span>PERSONNEL MANAGEMENT SYSTEM</span>
	</div>

	<PublicSiteNav {user} {active} {roadmapHref} {faqHref} {showFaqLink} />

	<div class={`public-body ${bodyClass}`.trim()}>
		{@render children()}
	</div>

	{#if showCta}
		{#if cta}
			{@render cta()}
		{:else}
			<PublicCta
				{user}
				titleBefore={ctaTitleBefore}
				emphasis={ctaEmphasis}
				subtitle={ctaSubtitle}
			/>
		{/if}
	{/if}

	<PublicFooter {roadmapHref} />
</div>

<style>
	.public-shell {
		--brass: var(--amber);
		--brass-light: var(--amber-vivid);
		--brass-muted: color-mix(in srgb, var(--amber) 14%, transparent);
		--ink: var(--color-chrome);
		--ink-light: color-mix(in srgb, var(--color-chrome) 86%, var(--paper) 14%);
		--ink-border: var(--color-chrome-border);
		--paper: var(--surface-panel);
		--paper-warm: color-mix(in srgb, var(--surface-panel) 78%, var(--surface-subtle) 22%);
		--hero-bg: var(--ink);
		--hero-text: var(--color-chrome-text);
		--hero-muted: var(--color-chrome-text-muted);
		min-height: 100vh;
		background: var(--surface-page);
		color: var(--text-primary);
		font-family: var(--font-body);
		overflow-x: hidden;
	}

	:global([data-theme='dark']) .public-shell {
		--paper: var(--surface-panel);
		--paper-warm: color-mix(in srgb, var(--surface-panel) 82%, black 18%);
	}

	.classification-bar {
		background: var(--ink);
		color: var(--hero-muted);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.15em;
		line-height: 1.4;
		text-align: center;
		text-transform: uppercase;
		padding: 0.375rem 1rem;
		border-bottom: 1px solid var(--ink-border);
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
