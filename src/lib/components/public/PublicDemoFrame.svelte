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
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--paper);
		box-shadow: var(--shadow-lg);
	}

	.demo-frame__chrome {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 10px var(--sp-4);
		border-bottom: var(--border-thin);
		background: var(--ink);
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
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-chrome-text);
	}

	.demo-frame__status {
		margin-left: auto;
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
		background: var(--success-bg);
		color: var(--success);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.demo-frame__body {
		padding: var(--sp-4);
		background: var(--paper);
	}

	@media (max-width: 640px) {
		.demo-frame__body {
			padding: 1rem;
		}
	}
</style>
