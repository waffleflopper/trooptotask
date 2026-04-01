<script lang="ts">
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Pricing — Troop to Task</title>
	<meta
		name="description"
		content="Simple, transparent pricing for Troop to Task. Free for small teams, affordable plans for larger units."
	/>
</svelte:head>

<PublicShell
	user={data.user}
	active="pricing"
	bodyClass="pricing-page"
	roadmapHref="/#roadmap"
	ctaTitleBefore="Ready to get"
	ctaEmphasis="organized?"
	ctaSubtitle="Free during beta — no strings attached. Beta testers get a generous grace period before any subscription is needed."
>
	<PublicPageHeader label="Pricing">
		{#snippet title()}Simple, transparent <em>pricing.</em>{/snippet}
		<p>No feature gating. Every plan gets the full platform. Pick the size that fits your formation.</p>
		<div class="beta-banner">
			<span class="beta-badge">BETA</span>
			<span>
				All features are <strong>completely free</strong> during the beta period. When
				pricing goes live, beta testers will receive a generous grace period before any
				subscription is required.
			</span>
		</div>
	</PublicPageHeader>

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
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							Up to <strong>15</strong> personnel
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							<strong>1</strong> organization
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							<strong>3</strong> exports per month
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
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
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							Up to <strong>80</strong> personnel
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							<strong>1</strong> organization
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							<strong>Unlimited</strong> exports
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
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
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							<strong>Unlimited</strong> personnel
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							<strong>Unlimited</strong> organizations
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
							<strong>Unlimited</strong> exports
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
								><polyline points="20 6 9 17 4 12" /></svg
							>
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
				<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
			</svg>
			<span>NIST 800-171 Aligned</span>
		</div>
		<div class="trust-badge">
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</svg>
			<span>256-bit Encryption</span>
		</div>
		<div class="trust-badge">
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
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
					<p>
						Yes. During the beta testing phase, all features and tiers are completely free with no credit card required.
						When pricing goes live, every beta tester will receive a generous grace period to decide on a plan — you
						won't be charged without notice.
					</p>
				</div>
				<div class="faq-item">
					<h3>What happens if I exceed my personnel cap?</h3>
					<p>
						Your organization enters read-only mode. You can still view and export all data, but you won't be able to
						add or edit records until you upgrade or remove personnel.
					</p>
				</div>
				<div class="faq-item">
					<h3>Can I cancel anytime?</h3>
					<p>
						Yes. You can cancel your subscription at any time. Your data remains accessible, and your organization
						reverts to the Free tier limits.
					</p>
				</div>
				<div class="faq-item">
					<h3>Are there any feature differences between plans?</h3>
					<p>
						No. Every plan includes the full platform — calendar, training tracker, leader's book, assignments,
						onboarding, and more. Plans differ only in personnel capacity and export limits.
					</p>
				</div>
			</div>
		</div>
	</section>

</PublicShell>

<style>
	/* ============================================
	   Pricing Page — reuses "Operations Directive" design system
	   Typography: Instrument Serif + DM Sans + DM Mono
	   ============================================ */

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

	/* ---- Mobile Responsive ---- */
	@media (max-width: 768px) {
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
