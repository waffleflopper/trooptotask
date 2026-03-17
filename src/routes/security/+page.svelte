<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>Security — Troop to Task</title>
	<meta name="description" content="Security practices and NIST 800-171 compliance information for Troop to Task." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="security-page">
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
				<a href="/pricing" class="nav-link">Pricing</a>
				<a href="/security" class="nav-link active">Security</a>
				<a href="/#roadmap" class="nav-link">Roadmap</a>
				<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="5" /><path
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
				{#if data.user}
					<a href="/dashboard?show=all" class="nav-cta">Dashboard</a>
				{:else}
					<a href="/auth/login" class="nav-cta">Get Started</a>
				{/if}
			</div>

			<div class="mobile-actions">
				<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
							><circle cx="12" cy="12" r="5" /></svg
						>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
							><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg
						>
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
			<div class="section-label">SECURITY</div>
			<h1>Your data, <em>protected.</em></h1>
			<p>TroopToTask aligns with NIST SP 800-171 for the protection of Controlled Unclassified Information.</p>
		</div>
	</section>

	<!-- Section 01 — Data Classification -->
	<section class="content-section">
		<div class="content-inner">
			<div class="content-label">01 // Data Classification</div>
			<h2>What we handle, and how we treat it.</h2>
			<p>
				TroopToTask manages personnel readiness data that may include Controlled Unclassified Information (CUI). This
				includes names, ranks, unit assignments, training records, counseling notes, and availability statuses. We treat
				all customer data as CUI-equivalent and apply protections accordingly.
			</p>
			<p>
				We do not process, store, or transmit classified information at any level. TroopToTask is designed exclusively
				for unclassified environments.
			</p>
		</div>
	</section>

	<!-- Section 02 — Encryption -->
	<section class="content-section alt">
		<div class="content-inner">
			<div class="content-label">02 // Encryption</div>
			<h2>Encrypted in transit and at rest.</h2>
			<p>
				All data transmitted between your browser and our servers is encrypted with TLS 1.2 or higher, enforced via HTTP
				Strict Transport Security (HSTS) headers. Downgrade attacks and cleartext connections are blocked.
			</p>
			<p>
				Data at rest is encrypted with AES-256 by our infrastructure providers. Database backups, file storage, and all
				persistent data stores use server-side encryption with managed keys.
			</p>
		</div>
	</section>

	<!-- Section 03 — Access Control -->
	<section class="content-section">
		<div class="content-inner">
			<div class="content-label">03 // Access Control</div>
			<h2>Every request is authorized.</h2>
			<p>
				Authentication is handled via Supabase Auth with support for email/password and multi-factor authentication
				(TOTP). Sessions are enforced with a 24-hour absolute timeout and secure, HttpOnly cookies.
			</p>
			<p>
				Authorization uses a layered approach: role-based access control (RBAC) at the application level with admin,
				editor, and viewer roles, combined with PostgreSQL Row-Level Security (RLS) policies that enforce tenant
				isolation at the database layer. Every API endpoint validates organization membership and role permissions
				server-side before processing requests.
			</p>
		</div>
	</section>

	<!-- Section 04 — Audit Logging -->
	<section class="content-section alt">
		<div class="content-inner">
			<div class="content-label">04 // Audit Logging</div>
			<h2>Every action leaves a trail.</h2>
			<p>
				TroopToTask maintains structured audit logs for security-relevant events including authentication attempts,
				permission changes, data modifications, and administrative actions. Logs capture the actor, action, resource,
				timestamp, and contextual metadata.
			</p>
			<p>
				Audit records are retained for 90 days, with automated cleanup of expired entries. Personally identifiable
				information is filtered from log details to maintain data minimization principles.
			</p>
		</div>
	</section>

	<!-- Section 05 — Infrastructure -->
	<section class="content-section">
		<div class="content-inner">
			<div class="content-label">05 // Infrastructure</div>
			<h2>Built on proven platforms.</h2>
			<p>TroopToTask runs on infrastructure from providers with established security programs:</p>
			<ul>
				<li><strong>Vercel</strong> — Application hosting and edge delivery. SOC 2 Type II certified.</li>
				<li>
					<strong>Supabase</strong> — PostgreSQL database, authentication, and file storage. SOC 2 Type II certified. Hosted
					on AWS with isolated tenancy.
				</li>
				<li>
					<strong>Stripe</strong> — Payment processing. PCI DSS Level 1 certified. TroopToTask never stores credit card numbers
					or payment credentials.
				</li>
			</ul>
			<p>All infrastructure is hosted within the United States.</p>
		</div>
	</section>

	<!-- Section 06 — Compliance Alignment -->
	<section class="content-section alt">
		<div class="content-inner">
			<div class="content-label">06 // Compliance Alignment</div>
			<h2>Aligned with NIST SP 800-171.</h2>
			<p>TroopToTask's security controls align with the following NIST SP 800-171 Rev 2 control families:</p>
			<ul>
				<li><strong>Access Control (3.1)</strong> — RBAC, RLS, session management, least privilege</li>
				<li>
					<strong>Audit &amp; Accountability (3.3)</strong> — Structured logging, retention policies, PII filtering
				</li>
				<li>
					<strong>Identification &amp; Authentication (3.5)</strong> — MFA support, password policies, session timeouts
				</li>
				<li>
					<strong>System &amp; Communications Protection (3.13)</strong> — TLS 1.2+, AES-256, security headers, CSP
				</li>
				<li>
					<strong>System &amp; Information Integrity (3.14)</strong> — Input validation, rate limiting, error handling
				</li>
				<li><strong>Incident Response (3.6)</strong> — Documented response procedures, contact channels</li>
			</ul>
			<p>
				While we are not FedRAMP authorized, we continuously improve our posture to support organizations that handle
				CUI.
			</p>
		</div>
	</section>

	<!-- Section 07 — Responsible Disclosure -->
	<section class="content-section">
		<div class="content-inner">
			<div class="content-label">07 // Responsible Disclosure</div>
			<h2>Report a vulnerability.</h2>
			<p>
				If you discover a security vulnerability in TroopToTask, we encourage responsible disclosure. Please report
				findings to:
			</p>
			<div class="disclosure-contact">
				<svg
					viewBox="0 0 24 24"
					width="20"
					height="20"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline
						points="22,6 12,13 2,6"
					/>
				</svg>
				<a href="mailto:security@trooptotask.app">security@trooptotask.app</a>
			</div>
			<p>
				We ask that you provide a reasonable amount of time for us to address reported issues before public disclosure.
				We will acknowledge receipt within 48 hours and aim to provide a resolution timeline within 5 business days.
			</p>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="cta">
		<div class="cta-container">
			<h2 class="cta-title">Ready to streamline<br /><em>your unit?</em></h2>
			<p class="cta-subtitle">Free to use. No credit card. Set up in minutes.</p>
			{#if data.user}
				<a href="/dashboard?show=all" class="cta-btn">
					Go to Dashboard
					<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"
						><path
							fill-rule="evenodd"
							d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/></svg
					>
				</a>
			{:else}
				<a href="/auth/login" class="cta-btn">
					Get Started Free
					<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"
						><path
							fill-rule="evenodd"
							d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/></svg
					>
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
				<a href="/security">Security</a>
			</div>
			<div class="footer-legal">
				<a href="/terms">Terms of Use</a>
				<span class="footer-legal-sep">&middot;</span>
				<a href="/privacy">Privacy Policy</a>
			</div>
			<p class="footer-text">Built for Army leaders, by Army leaders.</p>
		</div>
	</footer>
</div>

<style>
	/* ============================================
	   Security Page — reuses "Operations Directive" design system
	   Typography: Instrument Serif + DM Sans + DM Mono
	   ============================================ */

	.security-page {
		--font-display: 'Instrument Serif', Georgia, 'Times New Roman', serif;
		--font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
		--font-mono: 'DM Mono', 'Menlo', monospace;
		--brass: #b8943e;
		--brass-light: #d4b15a;
		--brass-muted: rgba(184, 148, 62, 0.15);
		--ink: #0f0f0f;
		--ink-light: #1a1a1a;
		--ink-border: #2a2a2a;
		--paper: #fafaf8;
		--paper-warm: #f5f4f0;
		--hero-bg: var(--ink);
		--hero-text: #f0ede6;
		--hero-muted: #8a8780;
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-body);
		overflow-x: hidden;
	}

	:global([data-theme='dark']) .security-page {
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

	/* ---- Content Sections ---- */
	.content-section {
		padding: 4rem 2rem;
		border-bottom: 1px solid var(--color-border);
	}

	.content-section.alt {
		background: var(--paper-warm);
	}

	:global([data-theme='dark']) .content-section.alt {
		background: var(--color-surface);
	}

	.content-inner {
		max-width: 720px;
		margin: 0 auto;
	}

	.content-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.75rem;
	}

	.content-inner h2 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 400;
		line-height: 1.15;
		margin-bottom: 1.25rem;
	}

	.content-inner h2 em {
		font-style: italic;
	}

	.content-inner p {
		font-size: 1rem;
		color: var(--color-text-secondary);
		line-height: 1.8;
		margin-bottom: 1rem;
	}

	.content-inner p:last-child {
		margin-bottom: 0;
	}

	.content-inner ul {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.content-inner li {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		font-size: 0.9375rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.content-inner li::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--brass);
		flex-shrink: 0;
		margin-top: 0.55rem;
	}

	.content-inner li strong {
		color: var(--color-text);
	}

	.disclosure-contact {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: var(--brass-muted);
		border: 1px solid rgba(184, 148, 62, 0.25);
		border-radius: 8px;
		margin-bottom: 1.25rem;
	}

	.disclosure-contact svg {
		color: var(--brass);
		flex-shrink: 0;
	}

	.disclosure-contact a {
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		color: var(--brass);
		text-decoration: none;
		letter-spacing: 0.02em;
	}

	.disclosure-contact a:hover {
		color: var(--brass-light);
		text-decoration: underline;
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
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.75rem;
		margin: 0;
	}

	.footer-legal {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.footer-legal a {
		color: var(--hero-muted);
		text-decoration: none;
		font-size: 0.75rem;
		transition: color 0.15s;
	}

	.footer-legal a:hover {
		color: var(--hero-text);
	}

	.footer-legal-sep {
		color: rgba(255, 255, 255, 0.15);
		font-size: 0.75rem;
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

		.content-section {
			padding: 3rem 1.5rem;
		}

		.content-inner h2 {
			font-size: 1.75rem;
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

		.content-section {
			padding: 2.5rem 1rem;
		}

		.content-inner h2 {
			font-size: 1.5rem;
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
