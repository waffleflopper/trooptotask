<script lang="ts">
	interface Props {
		name: string;
		price: string;
		priceNote?: string;
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
			{#if priceNote}
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
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.pricing-tier.highlighted {
		border-color: var(--amber);
	}

	.pricing-tier__badge {
		position: absolute;
		top: -0.75rem;
		left: 1.5rem;
		padding: 3px 8px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--amber);
		background: var(--amber-light);
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.pricing-tier__header {
		display: grid;
		gap: 0.75rem;
	}

	.pricing-tier__name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.pricing-tier__price {
		font-family: var(--font-display);
		font-size: clamp(2.5rem, 6vw, 3.6rem);
		font-weight: var(--font-weight-display);
		line-height: 0.92;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.pricing-tier__price span {
		margin-left: 0.35rem;
		font-family: var(--font-body);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-regular);
		text-transform: none;
		color: var(--text-secondary);
	}

	.pricing-tier__description {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.7;
		color: var(--text-secondary);
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
		font-size: var(--text-base);
		line-height: 1.6;
		color: var(--text-secondary);
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
		padding: 10px var(--sp-6);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-default);
		background: transparent;
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-semibold);
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
		background: var(--amber);
		color: var(--white);
		border-color: var(--amber);
	}

	.pricing-tier__cta:hover {
		border-color: var(--text-secondary);
		background: var(--surface-subtle);
	}

	.pricing-tier.highlighted .pricing-tier__cta:hover {
		background: var(--amber-vivid);
		border-color: var(--amber-vivid);
	}

	.pricing-tier__cta:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}
</style>
