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
					<a href="/#pricing" class="footer__link">Pricing</a>
					<a href="/security" class="footer__link">Security</a>
					<a href="/#faq" class="footer__link">FAQ</a>
				</div>
				<div class="footer__links-col">
					<div class="footer__link-heading">Access</div>
					<a href="/auth/request-access" class="footer__link">Request Access</a>
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
			<div class="footer-label">trooptotask.org</div>
			<div class="footer__meta-divider"></div>
			<div class="footer-label">Version 2.0</div>
			<div class="footer__meta-divider"></div>
			<div class="footer-label">Built for unit leaders</div>
		</div>
	</div>
</footer>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.footer-label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 9px;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.site-footer {
		border-top: 1px solid var(--border);
		padding: 3rem 0 2.5rem;
		background: var(--background);
	}

	.footer__inner {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 4rem;
		align-items: start;
	}

	.footer__brand {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: 0.02em;
		color: var(--foreground);
	}

	.footer__brand span {
		color: var(--accent);
	}

	.footer__tagline {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin-top: 0.5rem;
	}

	.footer__links {
		display: flex;
		gap: 3rem;
	}

	.footer__links-col {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.footer__link-heading {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin-bottom: 0.25rem;
	}

	.footer__link {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 0.8125rem;
		font-weight: 500;
		letter-spacing: 0.03em;
		color: var(--muted-foreground);
		transition: color 0.12s;
		text-decoration: none;
	}

	.footer__link:hover {
		color: var(--foreground);
	}

	.footer__link:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.footer__legal {
		justify-self: end;
		max-width: 36ch;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		color: var(--muted-foreground);
		line-height: 1.7;
		text-align: right;
	}

	.footer__legal-spacer {
		margin-top: 0.5rem;
	}

	.footer__legal-note {
		margin-top: 0.5rem;
	}

	.footer__meta {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.footer__meta-divider {
		width: 1px;
		height: 12px;
		background: var(--border);
	}

	@media (max-width: 900px) {
		.footer__inner {
			grid-template-columns: 1fr;
			gap: 2.5rem;
		}

		.footer__legal {
			justify-self: start;
			max-width: none;
			text-align: left;
		}
	}

	@media (max-width: 640px) {
		.container {
			padding: 0 1rem;
		}

		.footer__links {
			flex-direction: column;
			gap: 2rem;
		}
	}
</style>
