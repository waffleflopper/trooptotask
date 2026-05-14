<script lang="ts">
	interface Props {
		name: string;
		price: string;
		priceNote?: string;
		showPriceNote?: boolean;
		description: string;
		features: string[];
		ctaHref: string;
		ctaLabel: string;
		highlighted?: boolean;
		badge?: string;
	}

	let {
		name,
		price,
		priceNote = '/mo',
		showPriceNote = true,
		description,
		features,
		ctaHref,
		ctaLabel,
		highlighted = false,
		badge
	}: Props = $props();
</script>

<article class:highlighted class="pricing-tier">
	{#if badge}
		<div class="pricing-tier__badge">{badge}</div>
	{/if}

	<div class="pricing-tier__header">
		<div class="pricing-tier__name">{name}</div>
		<div class="pricing-tier__price">
			{price}
			{#if showPriceNote && priceNote}
				<span>{priceNote}</span>
			{/if}
		</div>
		<p class="pricing-tier__description">{description}</p>
	</div>

	<ul class="pricing-tier__features">
		{#each features as feature (feature)}
			<li>{feature}</li>
		{/each}
	</ul>

	<a href={ctaHref} class="pricing-tier__cta">{ctaLabel}</a>
</article>

<style>
	.pricing-tier {
		position: relative;
		display: grid;
		gap: 1.5rem;
		height: 100%;
		padding: 2rem 1.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}

	.pricing-tier.highlighted {
		border-color: var(--accent);
	}

	.pricing-tier__badge {
		position: absolute;
		top: -0.75rem;
		left: 1.5rem;
		padding: 3px 8px;
		border-radius: var(--radius);
		border: 1px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, var(--card));
		color: var(--accent);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.pricing-tier__header {
		display: grid;
		gap: 0.75rem;
	}

	.pricing-tier__name {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.pricing-tier__price {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.5rem, 6vw, 3.6rem);
		font-weight: 800;
		line-height: 0.92;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.pricing-tier__price span {
		margin-left: 0.35rem;
		font-family: 'Source Serif 4', serif;
		font-size: 1.1875rem;
		font-weight: 400;
		text-transform: none;
		color: var(--muted-foreground);
	}

	.pricing-tier__description {
		margin: 0;
		font-size: 1rem;
		line-height: 1.7;
		color: var(--muted-foreground);
	}

	.pricing-tier__features {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.pricing-tier__features li {
		position: relative;
		padding-left: 1.25rem;
		font-size: 1rem;
		line-height: 1.6;
		color: var(--muted-foreground);
	}

	.pricing-tier__features li::before {
		content: '';
		position: absolute;
		top: 0.7rem;
		left: 0;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		background: var(--brass);
	}

	.pricing-tier__cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-top: auto;
		padding: 10px 1.5rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.1875rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		text-decoration: none;
		text-transform: uppercase;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.pricing-tier.highlighted .pricing-tier__cta {
		background: var(--accent);
		color: var(--background);
		border-color: var(--accent);
	}

	.pricing-tier__cta:hover {
		border-color: var(--muted-foreground);
		background: var(--muted);
	}

	.pricing-tier.highlighted .pricing-tier__cta:hover {
		background: var(--accent);
		border-color: var(--accent);
	}

	.pricing-tier__cta:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}
</style>
