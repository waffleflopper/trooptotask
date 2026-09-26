<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		title: Snippet;
		children: Snippet;
	}

	let { label, title, children }: Props = $props();
</script>

<section class="page-header">
	<div class="hero-noise"></div>
	<div class="page-header-content">
		<div class="section-label">{label}</div>
		<h1>{@render title()}</h1>
		<div class="page-header-copy">
			{@render children()}
		</div>
	</div>
</section>

<style>
	.page-header {
		position: relative;
		background: var(--hero-bg);
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

	.section-label {
		margin-bottom: 1rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
	}

	.page-header h1 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.8rem, 6vw, 4.75rem);
		font-weight: 800;
		color: var(--hero-text);
		letter-spacing: 0.04em;
		line-height: 0.94;
		text-transform: uppercase;
	}

	.page-header h1 :global(em) {
		font-style: italic;
		font-weight: 300;
		color: var(--brass);
	}

	.page-header-copy {
		margin-top: 1rem;
	}

	.page-header-copy :global(p) {
		margin: 0 auto;
		max-width: 560px;
		font-size: 1.1875rem;
		line-height: 1.7;
		color: var(--hero-muted);
	}

	.page-header-copy :global(p + p),
	.page-header-copy :global(div + p),
	.page-header-copy :global(p + div) {
		margin-top: 1.25rem;
	}

	.page-header-copy :global(.page-meta) {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--hero-muted) 88%, var(--brass) 12%);
	}

	.hero-noise {
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	@media (max-width: 640px) {
		.page-header {
			padding: 4rem 1rem 3rem;
		}

		.page-header-copy :global(p) {
			font-size: 1rem;
		}
	}
</style>
