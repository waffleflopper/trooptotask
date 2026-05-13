<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	interface Props {
		user?: unknown;
		active?: 'features' | 'pricing' | 'security';
		roadmapHref?: string;
		faqHref?: string;
		showFaqLink?: boolean;
	}

	let { user, active, roadmapHref = '/#roadmap', faqHref = '/#faq', showFaqLink = false }: Props = $props();
</script>

<nav class="public-nav">
	<div class="nav-container">
		<a href="/" class="nav-brand">
			<div>
				<div class="nav-wordmark">Troop<span>To</span>Task</div>
				<div class="nav-subtitle">Unit Readiness Platform</div>
			</div>
		</a>

		<div class="nav-links">
			<a href="/features" class="nav-link" class:active={active === 'features'}>Features</a>
			<a href="/pricing" class="nav-link" class:active={active === 'pricing'}>Pricing</a>
			<a href="/security" class="nav-link" class:active={active === 'security'}>Security</a>
			{#if showFaqLink}
				<a href={faqHref} class="nav-link">FAQ</a>
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
				<a href="/dashboard?show=all" class="nav-button nav-button-outline">Dashboard</a>
			{:else}
				<a href="/auth/login" class="nav-button nav-button-outline">Sign In</a>
				<a href="/auth/request-access" class="nav-button nav-button-amber">Request Access</a>
			{/if}
		</div>
	</div>
</nav>

<style>
	.public-nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--background);
		border-bottom: 1px solid var(--border);
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
		color: var(--foreground);
		flex-shrink: 0;
	}

	.nav-wordmark {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.nav-wordmark span {
		color: var(--brass);
	}

	.nav-subtitle {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin-top: 0.25rem;
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
		color: var(--muted-foreground);
		border-bottom: 2px solid transparent;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.nav-link:hover,
	.nav-link.active {
		color: var(--foreground);
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
		color: var(--muted-foreground);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.theme-toggle:hover {
		color: var(--foreground);
		background: var(--muted);
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
		border-color: var(--border);
		color: var(--foreground);
	}

	.nav-button-outline:hover {
		border-color: var(--muted-foreground);
		background: var(--muted);
	}

	.nav-button-amber {
		background: var(--brass);
		border-color: var(--brass);
		color: var(--background);
	}

	.nav-button-amber:hover {
		background: var(--brass-light);
		border-color: var(--brass-light);
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

		.nav-wordmark {
			font-size: 18px;
		}

		.nav-subtitle {
			display: none;
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
