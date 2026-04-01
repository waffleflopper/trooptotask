<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	interface Props {
		user?: unknown;
		active?: 'features' | 'pricing' | 'security';
		roadmapHref?: string;
		faqHref?: string;
		showFaqLink?: boolean;
	}

	let {
		user,
		active,
		roadmapHref = '/#roadmap',
		faqHref = '/#faq',
		showFaqLink = false
	}: Props = $props();
</script>

<nav class="public-nav">
	<div class="nav-container">
		<a href="/" class="nav-brand">
			<div class="nav-mark">T2T</div>
			<span class="nav-wordmark">Troop to Task</span>
		</a>

		<div class="nav-links">
			<a href="/features" class="nav-link" class:active={active === 'features'}>Features</a>
			<a href="/pricing" class="nav-link" class:active={active === 'pricing'}>Pricing</a>
			<a href="/security" class="nav-link" class:active={active === 'security'}>Security</a>
			<a href={roadmapHref} class="nav-link">Roadmap</a>
			{#if showFaqLink}
				<a href={faqHref} class="nav-link">FAQ</a>
			{/if}
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
				<a href="/dashboard?show=all" class="nav-cta">Dashboard</a>
			{:else}
				<a href="/auth/login" class="nav-cta">Get Started</a>
			{/if}
		</div>

		<div class="mobile-actions">
			<button class="theme-toggle" type="button" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
				{#if themeStore.isDark}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="5" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
					</svg>
				{/if}
			</button>
			{#if user}
				<a href="/dashboard?show=all" class="nav-cta">Dashboard</a>
			{:else}
				<a href="/auth/login" class="nav-cta">Sign In</a>
			{/if}
		</div>
	</div>
</nav>

<style>
	.public-nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--ink);
		border-bottom: 1px solid var(--ink-border);
		backdrop-filter: blur(12px);
	}

	.nav-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		color: var(--hero-text);
		flex-shrink: 0;
	}

	.nav-mark {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		background: var(--brass);
		color: var(--ink);
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius-sm);
		line-height: 1;
	}

	.nav-wordmark {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.04em;
		line-height: 1;
		text-transform: uppercase;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.nav-link {
		color: var(--hero-muted);
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition: color var(--transition-fast);
	}

	.nav-link:hover,
	.nav-link.active {
		color: var(--hero-text);
	}

	.theme-toggle {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		border: 1px solid var(--ink-border);
		background: transparent;
		color: var(--hero-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.theme-toggle:hover {
		color: var(--hero-text);
		border-color: var(--hero-muted);
		background: rgba(255, 255, 255, 0.03);
	}

	.theme-toggle:focus-visible,
	.nav-cta:focus-visible,
	.nav-link:focus-visible,
	.nav-brand:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.theme-toggle svg {
		width: 16px;
		height: 16px;
	}

	.nav-cta {
		font-family: var(--font-display);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		color: var(--ink);
		background: var(--brass);
		padding: 0.45rem 1rem;
		border-radius: var(--radius-md);
		text-decoration: none;
		letter-spacing: 0.06em;
		line-height: 1;
		text-transform: uppercase;
		transition:
			background-color var(--transition-fast),
			transform var(--transition-fast);
	}

	.nav-cta:hover {
		background: var(--brass-light);
		transform: translateY(-1px);
	}

	.mobile-actions {
		display: none;
		align-items: center;
		gap: 0.75rem;
	}

	@media (max-width: 980px) {
		.nav-links {
			display: none;
		}

		.mobile-actions {
			display: flex;
		}
	}

	@media (max-width: 640px) {
		.nav-container {
			padding: 0 1rem;
		}

		.nav-wordmark {
			font-size: 1.25rem;
		}

		.nav-cta {
			padding-inline: 0.8rem;
		}
	}
</style>
