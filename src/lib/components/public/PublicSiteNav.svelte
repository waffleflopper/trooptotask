<script lang="ts">
	import { resolve } from '$app/paths';
	import PublicBrandMark from './PublicBrandMark.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';

	type PublicAnchorHref = '/' | '/#faq' | '/#roadmap' | '/#cta';

	interface Props {
		user?: unknown;
		active?: 'features' | 'pricing' | 'security';
		roadmapHref?: PublicAnchorHref;
		faqHref?: PublicAnchorHref;
		showFaqLink?: boolean;
		overlay?: boolean;
		scrolled?: boolean;
	}

	let {
		user,
		active,
		roadmapHref = '/#roadmap',
		faqHref = '/#faq',
		showFaqLink = false,
		overlay = false,
		scrolled = false
	}: Props = $props();
</script>

<nav class="public-nav" class:overlay class:scrolled={overlay && scrolled} data-roadmap-href={roadmapHref}>
	<div class="nav-container">
		<a href={resolve('/')} class="nav-brand">
			<PublicBrandMark hideSubtitleOnMobile />
		</a>

		<div class="nav-links">
			<a href={resolve('/features')} class="nav-link" class:active={active === 'features'}>Features</a>
			<a href={resolve('/pricing')} class="nav-link" class:active={active === 'pricing'}>Pricing</a>
			<a href={resolve('/security')} class="nav-link" class:active={active === 'security'}>Security</a>
			{#if showFaqLink}
				<a href={resolve(faqHref)} class="nav-link">FAQ</a>
			{/if}
		</div>

		<div class="nav-actions">
			<button class="theme-toggle" type="button" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
				{#if themeStore.isDark}
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="5" />
						<path
							d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
						/>
					</svg>
				{:else}
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
					</svg>
				{/if}
			</button>
			{#if user}
				<a href={resolve('/dashboard?show=all')} class="nav-button nav-button-outline">Dashboard</a>
			{:else}
				<a href={resolve('/auth/login')} class="nav-button nav-button-outline">Sign In</a>
				<a href={resolve('/auth/request-access')} class="nav-button nav-button-amber">Request Access</a>
			{/if}
		</div>
	</div>
</nav>

<style>
	.public-nav {
		--_fg: var(--foreground);
		--_muted: var(--muted-foreground);
		--_border: var(--border);
		--_bg: var(--background);
		--_hover-bg: var(--muted);
		--_btn-border: var(--border);
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--_bg);
		border-bottom: 1px solid var(--_border);
		transition:
			background-color 240ms cubic-bezier(0.2, 0, 0, 1),
			border-color 240ms cubic-bezier(0.2, 0, 0, 1),
			box-shadow 240ms cubic-bezier(0.2, 0, 0, 1);
	}

	.public-nav.overlay {
		position: fixed;
		left: 0;
		right: 0;
		--_fg: var(--hero-text);
		--_muted: var(--hero-muted);
		--_border: transparent;
		--_bg: var(--color-chrome-overlay);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		--_hover-bg: var(--hero-hover);
		--_btn-border: var(--hero-border);
	}

	.public-nav.overlay.scrolled {
		--_fg: var(--foreground);
		--_muted: var(--muted-foreground);
		--_border: var(--border);
		--_bg: var(--background);
		--_hover-bg: var(--muted);
		--_btn-border: var(--border);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		box-shadow: 0 1px 3px var(--color-chrome-shadow);
	}

	.nav-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
	}

	.nav-brand {
		display: flex;
		align-items: baseline;
		text-decoration: none;
		color: var(--_fg);
		flex-shrink: 0;
	}

	.nav-brand :global(.public-brand-mark) {
		--public-brand-accent: var(--brass);
		--public-brand-subtitle-color: var(--_muted);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 2rem;
		flex: 1;
		justify-content: center;
	}

	.nav-link {
		padding: 0.5rem 0;
		text-decoration: none;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--_muted);
		border-bottom: 2px solid transparent;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.nav-link:hover,
	.nav-link.active {
		color: var(--_fg);
		border-bottom-color: var(--brass);
	}

	.nav-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.theme-toggle {
		width: 36px;
		height: 36px;
		border-radius: var(--radius);
		border: none;
		background: transparent;
		color: var(--_muted);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.theme-toggle:hover {
		color: var(--_fg);
		background: var(--_hover-bg);
	}

	.theme-toggle svg {
		width: 16px;
		height: 16px;
	}

	.nav-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.45rem 1rem;
		border-radius: var(--radius);
		border: 1px solid transparent;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		text-decoration: none;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.nav-button-outline {
		background: transparent;
		border-color: var(--_btn-border);
		color: var(--_fg);
	}

	.nav-button-outline:hover {
		border-color: var(--_muted);
		background: var(--_hover-bg);
	}

	.nav-button-amber {
		background: var(--brass);
		border-color: var(--brass);
		color: var(--color-chrome);
	}

	.nav-button.nav-button-amber:hover {
		background: var(--brass-light);
		border-color: var(--brass-light);
		color: var(--color-chrome);
	}

	.nav-brand:focus-visible,
	.nav-link:focus-visible,
	.theme-toggle:focus-visible,
	.nav-button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	@media (max-width: 900px) {
		.nav-links {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.nav-container {
			padding: 0 1rem;
			gap: 1rem;
		}

		.nav-button {
			padding-inline: 0.75rem;
		}

		.theme-toggle {
			width: 34px;
			height: 34px;
		}
	}
</style>
