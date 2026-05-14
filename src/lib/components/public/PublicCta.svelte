<script lang="ts">
	interface Props {
		user?: unknown;
		titleBefore?: string;
		emphasis?: string;
		subtitle?: string;
	}

	let {
		user,
		titleBefore = 'Ready to streamline',
		emphasis = 'your unit?',
		subtitle = 'Free to use. No credit card. Set up in minutes.'
	}: Props = $props();
</script>

<section class="cta">
	<div class="cta-container">
		<h2 class="cta-title">
			{titleBefore}<br />
			<em>{emphasis}</em>
		</h2>
		<p class="cta-subtitle">{subtitle}</p>
		{#if user}
			<a href="/dashboard?show=all" class="cta-btn">
				Go to Dashboard
				<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
					<path
						fill-rule="evenodd"
						d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</a>
		{:else}
			<a href="/auth/login" class="cta-btn">
				Get Started Free
				<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
					<path
						fill-rule="evenodd"
						d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</a>
		{/if}
	</div>
</section>

<style>
	.cta {
		background: var(--foreground);
		color: var(--hero-text);
		padding: clamp(4rem, 8vw, 6rem) 2rem;
		border-top: 1px solid var(--public-ink-border);
	}

	.cta-container {
		max-width: 860px;
		margin: 0 auto;
		text-align: center;
	}

	.cta-title {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.8rem, 7vw, 5.2rem);
		font-weight: 800;
		letter-spacing: 0.04em;
		line-height: 0.92;
		text-transform: uppercase;
	}

	.cta-title em {
		font-style: italic;
		font-weight: 300;
		color: var(--brass);
	}

	.cta-subtitle {
		margin: 1.5rem auto 0;
		max-width: 44rem;
		color: var(--hero-muted);
		font-size: 1.1875rem;
		line-height: 1.7;
	}

	.cta-btn {
		margin-top: 2rem;
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.95rem 1.35rem;
		border-radius: var(--radius);
		background: var(--brass);
		color: var(--foreground);
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.1875rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		line-height: 1;
		text-decoration: none;
		text-transform: uppercase;
		transition:
			background-color var(--transition-fast),
			transform var(--transition-fast);
	}

	.cta-btn:hover {
		background: var(--brass-light);
		transform: translateY(-1px);
	}

	.cta-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.cta-btn svg {
		flex: 0 0 auto;
	}

	@media (max-width: 640px) {
		.cta {
			padding-inline: 1rem;
		}

		.cta-subtitle {
			font-size: 1rem;
		}
	}
</style>
