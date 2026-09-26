<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		id?: string;
		label: string;
		alternate?: boolean;
		title?: Snippet;
		children: Snippet;
	}

	let { id, label, alternate = false, title, children }: Props = $props();
</script>

<section {id} class:alt={alternate} class="content-section">
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
		background: var(--card);
		border-bottom: 1px solid var(--border);
		/* Clear the sticky nav (56px) plus any sticky in-page index when jumped to via anchor. */
		scroll-margin-top: 7rem;
	}

	.content-section.alt {
		background: var(--public-paper-warm);
	}

	.content-inner {
		max-width: 780px;
		margin: 0 auto;
	}

	.content-label {
		margin-bottom: 1rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass-text);
	}

	.content-inner h2 {
		margin: 0 0 1rem;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: 700;
		line-height: 0.98;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.content-inner h2 :global(em) {
		font-style: italic;
		font-weight: 300;
		color: var(--brass);
	}

	.content-inner :global(p) {
		margin: 0;
		font-size: 1rem;
		font-weight: 400;
		line-height: 1.8;
		color: var(--muted-foreground);
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
		color: var(--muted-foreground);
	}

	.content-inner :global(li) {
		margin: 0.65rem 0;
		font-weight: 400;
		line-height: 1.75;
	}

	.content-inner :global(a) {
		color: var(--brass-text);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--brass-text) 55%, transparent);
		text-underline-offset: 0.2em;
	}

	.content-inner :global(strong) {
		color: var(--foreground);
		font-weight: 600;
	}

	@media (max-width: 640px) {
		.content-section {
			padding: 3rem 1rem;
		}
	}
</style>
