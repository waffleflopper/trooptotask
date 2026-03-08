<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>Pricing — Troop to Task</title>
	<meta name="description" content="Simple, transparent pricing for Troop to Task. Free for small teams, affordable plans for larger units." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="pricing-page">
	<!-- Classification Bar -->
	<div class="classification-bar">
		<span>TROOP TO TASK</span>
		<span class="classification-sep">//</span>
		<span>PERSONNEL MANAGEMENT SYSTEM</span>
	</div>

	<!-- Navigation -->
	<nav class="nav">
		<div class="nav-container">
			<a href="/" class="nav-brand">
				<div class="nav-mark">T2T</div>
				<span class="nav-wordmark">Troop to Task</span>
			</a>

			<div class="nav-links">
				<a href="/features" class="nav-link">Features</a>
				<a href="/pricing" class="nav-link active">Pricing</a>
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
			<div class="section-label">Pricing</div>
			<h1>Simple, transparent <em>pricing.</em></h1>
			<p>No feature gating. Every plan gets the full platform. Pick the size that fits your formation.</p>
		<div class="beta-banner">
			<span class="beta-badge">BETA</span>
			<span>All features are <strong>completely free</strong> during the beta period. When pricing goes live, beta testers will receive a generous grace period before any subscription is required.</span>
		</div>
		</div>
	</section>

	<!-- Pricing Grid -->
	<section class="pricing-section">
		<div class="pricing-container">
			<div class="pricing-grid">
				<!-- Free -->
				<div class="pricing-card">
					<div class="card-header">
						<span class="tier-label">Free</span>
						<div class="price">$0<span class="price-period">/mo</span></div>
					</div>
					<p class="card-description">Perfect for squad leaders and small teams getting started.</p>
					<ul class="feature-list">
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							Up to <strong>15</strong> personnel
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							<strong>1</strong> organization
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							<strong>3</strong> exports per month
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							All platform features
						</li>
					</ul>
					<a href="/auth/login" class="card-cta card-cta-secondary">Get Started Free</a>
				</div>

				<!-- Team (highlighted) -->
				<div class="pricing-card highlighted">
					<div class="popular-badge">Most Popular</div>
					<div class="card-header">
						<span class="tier-label">Team</span>
						<div class="price">$15<span class="price-period">/mo</span></div>
					</div>
					<p class="card-description">For platoon-level leaders managing a full team.</p>
					<ul class="feature-list">
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							Up to <strong>80</strong> personnel
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							<strong>1</strong> organization
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							<strong>Unlimited</strong> exports
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							All platform features
						</li>
					</ul>
					<a href="/auth/login" class="card-cta card-cta-primary">Get Started</a>
				</div>

				<!-- Unit -->
				<div class="pricing-card">
					<div class="card-header">
						<span class="tier-label">Unit</span>
						<div class="price">$30<span class="price-period">/mo</span></div>
					</div>
					<p class="card-description">For company commanders and staff managing multiple elements.</p>
					<ul class="feature-list">
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							<strong>Unlimited</strong> personnel
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							<strong>Unlimited</strong> organizations
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							<strong>Unlimited</strong> exports
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
							All platform features
						</li>
					</ul>
					<a href="/auth/login" class="card-cta card-cta-primary">Get Started</a>
				</div>
			</div>
		</div>
	</section>

	<div class="trust-badges">
		<div class="trust-badge">
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
			</svg>
			<span>NIST 800-171 Aligned</span>
		</div>
		<div class="trust-badge">
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
			</svg>
			<span>256-bit Encryption</span>
		</div>
		<div class="trust-badge">
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
			</svg>
			<span>Audit Logged</span>
		</div>
	</div>

	<!-- FAQ Section -->
	<section class="faq-section">
		<div class="faq-container">
			<div class="section-label">FAQ</div>
			<h2>Common questions</h2>

			<div class="faq-grid">
				<div class="faq-item">
					<h3>Is the beta really free?</h3>
					<p>Yes. During the beta testing phase, all features and tiers are completely free with no credit card required. When pricing goes live, every beta tester will receive a generous grace period to decide on a plan — you won't be charged without notice.</p>
				</div>
				<div class="faq-item">
					<h3>What happens if I exceed my personnel cap?</h3>
					<p>Your organization enters read-only mode. You can still view and export all data, but you won't be able to add or edit records until you upgrade or remove personnel.</p>
				</div>
				<div class="faq-item">
					<h3>Can I cancel anytime?</h3>
					<p>Yes. You can cancel your subscription at any time. Your data remains accessible, and your organization reverts to the Free tier limits.</p>
				</div>
				<div class="faq-item">
					<h3>Are there any feature differences between plans?</h3>
					<p>No. Every plan includes the full platform — calendar, training tracker, leader's book, assignments, onboarding, and more. Plans differ only in personnel capacity and export limits.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="cta">
		<div class="cta-container">
			<h2 class="cta-title">Ready to get <em>organized?</em></h2>
			<p class="cta-subtitle">Free during beta — no strings attached. Beta testers get a generous grace period before any subscription is needed.</p>
			{#if data.user}
				<a href="/dashboard?show=all" class="cta-btn">
					Go to Dashboard
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
				</a>
			{:else}
				<a href="/auth/login" class="cta-btn">
					Get Started Free
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
				</a>
			{/if}
		</div>
	</section>

	<!-- Footer -->
	<footer class="footer">
		<div class="footer-container">
			<div class="footer-brand">
				<div class="footer-mark">T2T</div>
				<span>Troop to Task</span>
			</div>
			<div class="footer-links">
				<a href="/help">Help</a>
				<a href="/features">Features</a>
				<a href="/pricing">Pricing</a>
				<a href="/#roadmap">Roadmap</a>
			</div>
			<p class="footer-text">Built for Army leaders, by Army leaders.</p>
		</div>
	</footer>
</div>

<style>
	/* ============================================
	   Pricing Page — reuses "Operations Directive" design system
	   Typography: Instrument Serif + DM Sans + DM Mono
	   ============================================ */

	.pricing-page {
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

	:global([data-theme='dark']) .pricing-page {
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

	.beta-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: 620px;
		margin: 1.5rem auto 0;
		padding: 0.875rem 1.25rem;
		background: rgba(184, 148, 62, 0.1);
		border: 1px solid rgba(184, 148, 62, 0.3);
		border-radius: 8px;
		font-size: 0.9375rem;
		color: var(--hero-text);
		line-height: 1.6;
		text-align: left;
	}

	.beta-badge {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		background: var(--brass);
		color: var(--ink);
		padding: 0.2rem 0.625rem;
		border-radius: 4px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.hero-noise {
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	.section-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.75rem;
	}

	/* ---- Pricing Section ---- */
	.pricing-section {
		padding: 5rem 0;
		background: var(--paper);
	}

	:global([data-theme='dark']) .pricing-section {
		background: var(--color-bg);
	}

	.pricing-container {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.pricing-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
		align-items: start;
	}

	.pricing-card {
		position: relative;
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border, #e2e2e2);
		border-radius: 12px;
		padding: 2.5rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.pricing-card.highlighted {
		border: 2px solid var(--brass);
		box-shadow: 0 8px 32px rgba(184, 148, 62, 0.12);
	}

	.popular-badge {
		position: absolute;
		top: -12px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--brass);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.25rem 1rem;
		border-radius: 999px;
		white-space: nowrap;
	}

	.card-header {
		text-align: center;
	}

	.tier-label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-secondary, #666);
	}

	.price {
		font-family: var(--font-display);
		font-size: 3.5rem;
		font-weight: 400;
		color: var(--color-text);
		line-height: 1.1;
		margin-top: 0.5rem;
	}

	.price-period {
		font-family: var(--font-body);
		font-size: 1rem;
		color: var(--color-text-secondary, #666);
		font-weight: 400;
	}

	.card-description {
		font-size: 0.9375rem;
		color: var(--color-text-secondary, #666);
		line-height: 1.6;
		text-align: center;
		margin: 0;
	}

	.feature-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		flex: 1;
	}

	.feature-list li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9375rem;
		color: var(--color-text);
	}

	.feature-list li svg {
		flex-shrink: 0;
		color: var(--brass);
	}

	.card-cta {
		display: block;
		text-align: center;
		padding: 0.875rem 1.5rem;
		border-radius: 8px;
		font-family: var(--font-body);
		font-size: 0.9375rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.2s;
		letter-spacing: 0.01em;
	}

	.card-cta-primary {
		background: var(--brass);
		color: var(--ink);
	}

	.card-cta-primary:hover {
		background: var(--brass-light);
		transform: translateY(-1px);
	}

	.card-cta-secondary {
		background: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border, #e2e2e2);
	}

	.card-cta-secondary:hover {
		border-color: var(--brass);
		color: var(--brass);
	}

	/* ---- Trust Badges ---- */
	.trust-badges {
		display: flex;
		justify-content: center;
		gap: 40px;
		padding: 24px 0;
		margin-top: 24px;
	}

	.trust-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--color-text-secondary);
		font-size: 12px;
		font-family: var(--font-mono);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.trust-badge svg {
		color: var(--brass);
		flex-shrink: 0;
	}

	/* ---- FAQ Section ---- */
	.faq-section {
		padding: 5rem 0;
		background: var(--paper-warm);
		border-top: 1px solid var(--color-border, #e2e2e2);
	}

	:global([data-theme='dark']) .faq-section {
		background: var(--color-surface);
	}

	.faq-container {
		max-width: 800px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.faq-container h2 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 400;
		margin-bottom: 2.5rem;
		color: var(--color-text);
	}

	.faq-grid {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.faq-item h3 {
		font-family: var(--font-body);
		font-size: 1.0625rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text);
	}

	.faq-item p {
		font-size: 0.9375rem;
		color: var(--color-text-secondary, #666);
		line-height: 1.7;
		margin: 0;
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

	/* ---- Mobile Responsive ---- */
	@media (max-width: 768px) {
		.nav-links {
			display: none;
		}

		.mobile-actions {
			display: flex;
		}

		.page-header {
			padding: 3rem 1.5rem 2.5rem;
		}

		.page-header h1 {
			font-size: 2rem;
		}

		.pricing-grid {
			grid-template-columns: 1fr;
			max-width: 400px;
			margin: 0 auto;
		}

		.pricing-card.highlighted {
			order: -1;
		}

		.faq-container h2 {
			font-size: 1.5rem;
		}

		.cta-title {
			font-size: 2rem;
		}

		.footer-container {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}
	}

	@media (min-width: 769px) and (max-width: 1024px) {
		.pricing-container {
			padding: 0 1.5rem;
		}

		.pricing-card {
			padding: 2rem 1.5rem;
		}
	}
</style>
