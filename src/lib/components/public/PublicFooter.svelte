<footer class="site-footer">
	<div class="container">
		<div class="footer__inner">
			<div>
				<div class="footer__brand">Troop<span>To</span>Task</div>
				<div class="footer__tagline">Unit Readiness Platform</div>
			</div>

			<div class="footer__links">
				<div class="footer__links-col">
					<div class="footer__link-heading">Product</div>
					<a href="/features" class="footer__link">Features</a>
					<a href="/pricing" class="footer__link">Pricing</a>
					<a href="/security" class="footer__link">Security</a>
					<a href="/#faq" class="footer__link">FAQ</a>
				</div>
				<div class="footer__links-col">
					<div class="footer__link-heading">Access</div>
					<a href="/auth/request-access" class="footer__link">Request Access</a>
					<a href="/demo" class="footer__link">Schedule Demo</a>
					<a href="/auth/login" class="footer__link">Sign In</a>
				</div>
				<div class="footer__links-col">
					<div class="footer__link-heading">Legal</div>
					<a href="/privacy" class="footer__link">Privacy Policy</a>
					<a href="/terms" class="footer__link">Terms of Use</a>
					<a href="/help" class="footer__link">Help</a>
				</div>
			</div>

			<div class="footer__legal">
				<div>© 2026 TroopToTask. All rights reserved.</div>
				<div class="footer__legal-spacer">Not affiliated with the U.S. Department of Defense.</div>
				<div>Designed for DoD personnel use.</div>
				<div class="footer__legal-note">
					Formal government adoption may involve additional review. Day-to-day use should follow local policy and
					data-handling guidance.
				</div>
			</div>
		</div>

		<div class="footer__meta">
			<div class="label">trooptotask.org</div>
			<div class="footer__meta-divider"></div>
			<div class="label">Version 2.0</div>
			<div class="footer__meta-divider"></div>
			<div class="label">Built for unit leaders</div>
		</div>
	</div>
</footer>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 var(--sp-8);
	}

	.label {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.site-footer {
		border-top: var(--border-thin);
		padding: var(--sp-12) 0 var(--sp-10);
		background: var(--surface-page);
	}

	.footer__inner {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--sp-16);
		align-items: start;
	}

	.footer__brand {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: var(--font-weight-display);
		letter-spacing: 0.02em;
		color: var(--text-primary);
	}

	.footer__brand span {
		color: var(--amber);
	}

	.footer__tagline {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		margin-top: var(--sp-2);
	}

	.footer__links {
		display: flex;
		gap: var(--sp-12);
	}

	.footer__links-col {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.footer__link-heading {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-1);
	}

	.footer__link {
		font-family: var(--font-display);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.03em;
		color: var(--text-secondary);
		transition: color 0.12s;
		text-decoration: none;
	}

	.footer__link:hover {
		color: var(--text-primary);
	}

	.footer__link:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.footer__legal {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-tertiary);
		line-height: 1.7;
		text-align: right;
	}

	.footer__legal-spacer {
		margin-top: var(--sp-2);
	}

	.footer__legal-note {
		margin-top: var(--sp-2);
		max-width: 34ch;
	}

	.footer__meta {
		margin-top: var(--sp-8);
		padding-top: var(--sp-6);
		border-top: var(--border-thin);
		display: flex;
		align-items: center;
		gap: var(--sp-6);
		flex-wrap: wrap;
	}

	.footer__meta-divider {
		width: 1px;
		height: 12px;
		background: var(--border-default);
	}

	@media (max-width: 900px) {
		.footer__inner {
			grid-template-columns: 1fr;
			gap: var(--sp-10);
		}

		.footer__legal {
			text-align: left;
		}
	}

	@media (max-width: 640px) {
		.container {
			padding: 0 1rem;
		}

		.footer__links {
			flex-direction: column;
			gap: var(--sp-8);
		}
	}
</style>
