<script lang="ts">
	interface Props {
		roadmapHref?: string;
	}

	let { roadmapHref = '/#roadmap' }: Props = $props();
</script>

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
			<a href={roadmapHref}>Roadmap</a>
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

<style>
	.footer {
		background: var(--surface-subtle);
		border-top: 1px solid var(--border-default);
		padding: 2rem;
	}

	.footer-container {
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		gap: 1rem 2rem;
		align-items: center;
	}

	.footer-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.footer-mark {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		background: var(--brass);
		color: var(--ink);
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius-sm);
		line-height: 1;
	}

	.footer-links,
	.footer-legal {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1rem;
		justify-content: center;
	}

	.footer a {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.12em;
		text-decoration: none;
		text-transform: uppercase;
	}

	.footer a:hover {
		color: var(--text-primary);
	}

	.footer-text {
		margin: 0;
		text-align: right;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: 1.5;
		white-space: nowrap;
	}

	.footer-legal-sep {
		color: var(--text-tertiary);
	}

	@media (max-width: 1100px) {
		.footer-container {
			grid-template-columns: 1fr;
			text-align: center;
		}

		.footer-brand,
		.footer-links,
		.footer-legal {
			justify-content: center;
		}

		.footer-text {
			text-align: center;
		}
	}

	@media (max-width: 640px) {
		.footer {
			padding: 1.5rem 1rem;
		}
	}
</style>
