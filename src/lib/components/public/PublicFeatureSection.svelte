<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		titleBefore: string;
		emphasis?: string;
		titleAfter?: string;
		description: string;
		bullets: string[];
		reversed?: boolean;
		alternate?: boolean;
		badge?: string;
		children: Snippet;
	}

	let {
		label,
		titleBefore,
		emphasis,
		titleAfter,
		description,
		bullets,
		reversed = false,
		alternate = false,
		badge,
		children
	}: Props = $props();
</script>

<section class:alternate class:reversed class="feature-band">
	<div class="feature-band__inner">
		<div class="feature-band__copy">
			<div class="feature-band__label">
				<span>{label}</span>
				{#if badge}
					<span class="feature-band__badge">{badge}</span>
				{/if}
			</div>

			<h2 class="feature-band__title">
				{titleBefore}
				{#if emphasis}
					<em>{emphasis}</em>
				{/if}
				{#if titleAfter}
					{titleAfter}
				{/if}
			</h2>

			<p class="feature-band__description">{description}</p>

			<ul class="feature-band__list">
				{#each bullets as bullet}
					<li>{bullet}</li>
				{/each}
			</ul>
		</div>

		<div class="feature-band__media">
			{@render children()}
		</div>
	</div>
</section>

<style>
	.feature-band {
		padding: clamp(3.5rem, 7vw, 5.5rem) 2rem;
		border-bottom: 1px solid var(--border-default);
		background: var(--paper);
	}

	.feature-band.alternate {
		background: var(--paper-warm);
	}

	.feature-band__inner {
		max-width: 1180px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: clamp(2rem, 5vw, 4.5rem);
		align-items: center;
	}

	.feature-band.reversed .feature-band__copy {
		order: 2;
	}

	.feature-band.reversed .feature-band__media {
		order: 1;
	}

	.feature-band__copy {
		display: grid;
		gap: 1rem;
	}

	.feature-band__label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
	}

	.feature-band__badge {
		padding: 0.18rem 0.45rem;
		border-radius: var(--radius-sm);
		border: 1px solid color-mix(in srgb, var(--brass) 26%, transparent);
		background: var(--brass-muted);
		color: var(--text-primary);
		font-size: 0.55rem;
		letter-spacing: 0.14em;
	}

	.feature-band__title {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 3.4rem);
		font-weight: var(--font-weight-bold);
		line-height: 0.98;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.feature-band__title em {
		font-style: italic;
		font-weight: var(--font-weight-light);
		color: var(--brass);
	}

	.feature-band__description {
		margin: 0;
		max-width: 34rem;
		font-size: var(--text-lg);
		line-height: 1.75;
		color: var(--text-secondary);
	}

	.feature-band__list {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.feature-band__list li {
		position: relative;
		padding-left: 1.25rem;
		font-size: var(--text-base);
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.feature-band__list li::before {
		content: '';
		position: absolute;
		top: 0.7rem;
		left: 0;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		background: var(--brass);
	}

	.feature-band__media {
		min-width: 0;
	}

	@media (max-width: 900px) {
		.feature-band__inner {
			grid-template-columns: 1fr;
		}

		.feature-band.reversed .feature-band__copy,
		.feature-band.reversed .feature-band__media {
			order: initial;
		}
	}

	@media (max-width: 640px) {
		.feature-band {
			padding-inline: 1rem;
		}

		.feature-band__description {
			font-size: var(--text-base);
		}
	}
</style>
