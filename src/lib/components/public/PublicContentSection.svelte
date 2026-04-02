<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		alternate?: boolean;
		title?: Snippet;
		children: Snippet;
	}

	let { label, alternate = false, title, children }: Props = $props();
</script>

<section class:alt={alternate} class="content-section">
	<div class="content-inner">
		<div class="content-label">{label}</div>
		{#if title}
			<h2>{@render title()}</h2>
		{/if}
		{@render children()}
	</div>
</section>

<style>
	.content-section {
		padding: 4rem 2rem;
		background: var(--paper);
		border-bottom: 1px solid var(--border-default);
	}

	.content-section.alt {
		background: var(--paper-warm);
	}

	.content-inner {
		max-width: 780px;
		margin: 0 auto;
	}

	.content-label {
		margin-bottom: 1rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
	}

	.content-inner h2 {
		margin: 0 0 1rem;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: var(--font-weight-bold);
		line-height: 0.98;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.content-inner h2 :global(em) {
		font-style: italic;
		font-weight: var(--font-weight-light);
		color: var(--brass);
	}

	.content-inner :global(p) {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.8;
		color: var(--text-secondary);
	}

	.content-inner :global(p + p),
	.content-inner :global(p + ul),
	.content-inner :global(ul + p),
	.content-inner :global(div + p),
	.content-inner :global(p + div),
	.content-inner :global(ul + div),
	.content-inner :global(div + ul) {
		margin-top: 1rem;
	}

	.content-inner :global(ul) {
		margin: 0;
		padding-left: 1.2rem;
		color: var(--text-secondary);
	}

	.content-inner :global(li) {
		margin: 0.65rem 0;
		line-height: 1.75;
	}

	.content-inner :global(a) {
		color: var(--brass);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--brass) 55%, transparent);
		text-underline-offset: 0.2em;
	}

	.content-inner :global(strong) {
		color: var(--text-primary);
		font-weight: var(--font-weight-semibold);
	}

	.content-inner :global(.contact-card) {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: var(--brass-muted);
		border: 1px solid color-mix(in srgb, var(--brass) 28%, transparent);
		border-radius: var(--radius-md);
	}

	.content-inner :global(.contact-card svg) {
		flex: 0 0 auto;
		color: var(--brass);
	}

	.content-inner :global(.contact-card a) {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.06em;
		text-decoration: none;
		text-transform: uppercase;
	}

	.content-inner :global(.contact-card a:hover) {
		color: var(--brass-light);
		text-decoration: underline;
	}

	@media (max-width: 640px) {
		.content-section {
			padding: 3rem 1rem;
		}
	}
</style>
