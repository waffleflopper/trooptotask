<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		status?: string;
		children: Snippet;
	}

	let { label, status, children }: Props = $props();
</script>

<div class="demo-frame">
	<div class="demo-frame__chrome">
		<div class="demo-frame__dots" aria-hidden="true"><span></span><span></span><span></span></div>
		<span class="demo-frame__label">{label}</span>
		{#if status}
			<span class="demo-frame__status">{status}</span>
		{/if}
	</div>

	<div class="demo-frame__body">
		{@render children()}
	</div>
</div>

<style>
	.demo-frame {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		box-shadow:
			0 4px 20px rgb(0 0 0 / 0.12),
			0 2px 6px rgb(0 0 0 / 0.07);
	}

	.demo-frame__chrome {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 10px 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--color-chrome);
	}

	.demo-frame__dots {
		display: flex;
		gap: 0.35rem;
	}

	.demo-frame__dots span {
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-chrome-text-muted) 40%, transparent);
	}

	.demo-frame__label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-chrome-text);
	}

	.demo-frame__status {
		margin-left: auto;
		padding: 2px 7px;
		border-radius: var(--radius);
		border: 1px solid color-mix(in srgb, var(--chart-2) 20%, transparent);
		background: color-mix(in srgb, var(--chart-2) 14%, var(--card));
		color: var(--chart-2);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.demo-frame__body {
		padding: 1rem;
		background: var(--card);
	}

	@media (max-width: 640px) {
		.demo-frame__body {
			padding: 1rem;
		}
	}
</style>
