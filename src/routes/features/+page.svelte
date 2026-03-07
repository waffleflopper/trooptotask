<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>Features — Troop to Task</title>
	<meta name="description" content="Explore all Troop to Task features: visual calendars, personnel management, training tracking, leaders book, in-processing checklists, rating schemes, and daily assignments." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="features-page">
	<!-- Classification Bar — same as landing -->
	<div class="classification-bar">
		<span>TROOP TO TASK</span>
		<span class="classification-sep">//</span>
		<span>PERSONNEL MANAGEMENT SYSTEM</span>
	</div>

	<!-- Navigation — same as landing but Features link is active -->
	<nav class="nav">
		<div class="nav-container">
			<a href="/" class="nav-brand">
				<div class="nav-mark">T2T</div>
				<span class="nav-wordmark">Troop to Task</span>
			</a>

			<div class="nav-links">
				<a href="/features" class="nav-link active">Features</a>
				<a href="/#roadmap" class="nav-link">Roadmap</a>
				<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					{/if}
				</button>
				{#if data.user}
					<a href="/dashboard?show=all" class="nav-cta">Dashboard</a>
				{:else}
					<a href="/auth/login" class="nav-cta">Get Started</a>
				{/if}
			</div>

			<div class="mobile-actions">
				<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
					{/if}
				</button>
				{#if data.user}
					<a href="/dashboard?show=all" class="nav-cta">Dashboard</a>
				{:else}
					<a href="/auth/login" class="nav-cta">Sign In</a>
				{/if}
			</div>
		</div>
	</nav>

	<!-- Page Header -->
	<section class="page-header">
		<div class="hero-noise"></div>
		<div class="page-header-content">
			<div class="section-label">Platform</div>
			<h1>Everything your unit needs,<br /><em>nothing it doesn't.</em></h1>
			<p>Seven core tools that replace your whiteboard, spreadsheets, and shared drives. Each one built for how Army units actually operate.</p>
		</div>
	</section>

	<!-- Feature sections will be added in Tasks 5-7 -->

	<!-- CTA Section — same as landing -->
	<section class="cta">
		<div class="cta-container">
			<h2 class="cta-title">Ready to streamline<br /><em>your unit?</em></h2>
			<p class="cta-subtitle">Free to use. No credit card. Set up in minutes.</p>
			{#if data.user}
				<a href="/dashboard?show=all" class="cta-btn">
					Go to Dashboard
					<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
				</a>
			{:else}
				<a href="/auth/login" class="cta-btn">
					Get Started Free
					<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
				</a>
			{/if}
		</div>
	</section>

	<!-- Footer — same as landing -->
	<footer class="footer">
		<div class="footer-container">
			<div class="footer-brand">
				<div class="footer-mark">T2T</div>
				<span>Troop to Task</span>
			</div>
			<div class="footer-links">
				<a href="/help">Help</a>
				<a href="/features">Features</a>
				<a href="/#roadmap">Roadmap</a>
			</div>
			<p class="footer-text">Built for Army leaders, by Army leaders.</p>
		</div>
	</footer>
</div>

<style>
	/* ============================================
	   Features Page — reuses "Operations Directive" design system
	   Typography: Instrument Serif + DM Sans + DM Mono
	   ============================================ */

	.features-page {
		--font-display: 'Instrument Serif', Georgia, 'Times New Roman', serif;
		--font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
		--font-mono: 'DM Mono', 'Menlo', monospace;
		--brass: #B8943E;
		--brass-light: #D4B15A;
		--brass-muted: rgba(184, 148, 62, 0.15);
		--ink: #0F0F0F;
		--ink-light: #1A1A1A;
		--ink-border: #2A2A2A;
		--paper: #FAFAF8;
		--paper-warm: #F5F4F0;
		--hero-bg: var(--ink);
		--hero-text: #F0EDE6;
		--hero-muted: #8A8780;
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-body);
		overflow-x: hidden;
	}

	:global([data-theme='dark']) .features-page {
		--paper: var(--color-bg);
		--paper-warm: var(--color-surface);
	}

	/* ---- Classification Bar ---- */
	.classification-bar {
		background: var(--ink);
		color: var(--hero-muted);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		text-align: center;
		padding: 0.375rem 1rem;
		border-bottom: 1px solid var(--ink-border);
	}

	.classification-sep {
		color: var(--brass);
		margin: 0 0.75rem;
	}

	/* ---- Navigation ---- */
	.nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--ink);
		border-bottom: 1px solid var(--ink-border);
	}

	.nav-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		color: var(--hero-text);
	}

	.nav-mark {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		background: var(--brass);
		color: var(--ink);
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
		line-height: 1;
	}

	.nav-wordmark {
		font-family: var(--font-display);
		font-size: 1.25rem;
		letter-spacing: -0.01em;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.nav-link {
		color: var(--hero-muted);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 400;
		transition: color 0.15s;
		letter-spacing: 0.01em;
	}

	.nav-link:hover {
		color: var(--hero-text);
	}

	.nav-link.active {
		color: var(--hero-text);
	}

	.theme-toggle {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		border: 1px solid var(--ink-border);
		background: transparent;
		color: var(--hero-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.theme-toggle:hover {
		color: var(--hero-text);
		border-color: var(--hero-muted);
	}

	.theme-toggle svg {
		width: 16px;
		height: 16px;
	}

	.nav-cta {
		font-family: var(--font-body);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--ink);
		background: var(--brass);
		padding: 0.4rem 1rem;
		border-radius: 6px;
		text-decoration: none;
		letter-spacing: 0.02em;
		transition: all 0.15s;
	}

	.nav-cta:hover {
		background: var(--brass-light);
	}

	.mobile-actions {
		display: none;
		align-items: center;
		gap: 0.75rem;
	}

	/* ---- Page Header ---- */
	.page-header {
		position: relative;
		background: var(--ink);
		padding: 5rem 2rem 4rem;
		overflow: hidden;
		text-align: center;
	}

	.page-header-content {
		position: relative;
		z-index: 1;
		max-width: 720px;
		margin: 0 auto;
	}

	.page-header h1 {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 400;
		color: var(--hero-text);
		margin-bottom: 1rem;
		line-height: 1.15;
	}

	.page-header h1 em {
		font-style: italic;
		color: var(--brass);
	}

	.page-header p {
		font-size: 1.0625rem;
		color: var(--hero-muted);
		max-width: 560px;
		margin: 0 auto;
		line-height: 1.7;
	}

	.page-header .section-label {
		margin-bottom: 1rem;
	}

	.hero-noise {
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	/* ---- Sections (shared) ---- */
	.section-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.75rem;
	}

	/* ---- CTA ---- */
	.cta {
		padding: 6rem 0;
		background: var(--ink);
		position: relative;
		overflow: hidden;
	}

	.cta::before {
		content: '';
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	.cta-container {
		max-width: 700px;
		margin: 0 auto;
		padding: 0 2rem;
		text-align: center;
		position: relative;
	}

	.cta-title {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 400;
		color: var(--hero-text);
		margin-bottom: 1rem;
		line-height: 1.1;
	}

	.cta-title em {
		font-style: italic;
		color: var(--brass);
	}

	.cta-subtitle {
		font-size: 1.0625rem;
		color: var(--hero-muted);
		margin-bottom: 2.5rem;
	}

	.cta-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-body);
		font-size: 1rem;
		font-weight: 500;
		color: var(--ink);
		background: var(--brass);
		padding: 0.875rem 2rem;
		border-radius: 8px;
		text-decoration: none;
		transition: all 0.2s;
	}

	.cta-btn:hover {
		background: var(--brass-light);
		transform: translateY(-1px);
	}

	.cta-btn svg {
		width: 16px;
		height: 16px;
	}

	/* ---- Footer ---- */
	.footer {
		padding: 1.5rem 0;
		background: var(--ink);
		border-top: 1px solid var(--ink-border);
	}

	.footer-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.footer-brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		color: var(--hero-muted);
		font-size: 0.875rem;
	}

	.footer-mark {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		background: var(--ink-border);
		color: var(--hero-muted);
		padding: 0.2rem 0.375rem;
		border-radius: 3px;
		line-height: 1;
	}

	.footer-links {
		display: flex;
		gap: 1.5rem;
	}

	.footer-links a {
		color: var(--hero-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		transition: color 0.15s;
	}

	.footer-links a:hover {
		color: var(--hero-text);
	}

	.footer-text {
		color: rgba(255,255,255,0.2);
		font-size: 0.75rem;
		margin: 0;
	}

	/* ============================================
	   Responsive — Tablet
	   ============================================ */
	@media (max-width: 1024px) {
		.page-header {
			padding: 4rem 1.5rem 3rem;
		}

		.page-header h1 {
			font-size: 2.5rem;
		}
	}

	/* ============================================
	   Responsive — Mobile
	   ============================================ */
	@media (max-width: 640px) {
		.classification-bar {
			font-size: 0.5625rem;
			padding: 0.25rem 0.75rem;
		}

		.classification-sep {
			margin: 0 0.375rem;
		}

		.nav-container {
			padding: 0 1rem;
			height: 48px;
		}

		.nav-links {
			display: none;
		}

		.mobile-actions {
			display: flex;
		}

		.nav-wordmark {
			font-size: 1.0625rem;
		}

		.page-header {
			padding: 3rem 1rem 2.5rem;
		}

		.page-header h1 {
			font-size: 2rem;
		}

		.page-header p {
			font-size: 0.9375rem;
		}

		.cta {
			padding: 4rem 0;
		}

		.cta-title {
			font-size: 2rem;
		}

		.cta-subtitle {
			font-size: 0.9375rem;
		}

		.footer-container {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}

		.footer-links {
			gap: 1rem;
		}
	}

	/* ============================================
	   Reduced Motion
	   ============================================ */
	@media (prefers-reduced-motion: reduce) {
		.cta-btn:hover {
			transform: none;
		}
	}
</style>
