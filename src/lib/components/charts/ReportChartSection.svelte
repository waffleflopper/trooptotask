<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		titleId: string;
		description: string;
		descriptionId: string;
		kicker?: string;
		loading?: boolean;
		sectionClass?: string;
		children: Snippet;
	}

	let {
		title,
		titleId,
		description,
		descriptionId,
		kicker,
		loading = false,
		sectionClass = '',
		children
	}: Props = $props();

	const className = $derived(['report-chart-section', sectionClass].filter(Boolean).join(' '));
</script>

<section
	class={className}
	aria-labelledby={titleId}
	aria-describedby={descriptionId}
	aria-busy={loading ? 'true' : 'false'}
	data-report-chart-section="true"
>
	<div class="report-chart-header">
		<div>
			<h2 id={titleId}>{title}</h2>
			<p id={descriptionId} class="screen-reader-text">
				{description}
			</p>
		</div>
		{#if kicker || loading}
			<div class="report-chart-meta">
				{#if kicker}
					<span class="chart-kicker">{kicker}</span>
				{/if}
				{#if loading}
					<span class="chart-status">Updating</span>
				{/if}
			</div>
		{/if}
	</div>

	{@render children()}
</section>

<style>
	.report-chart-section {
		--trend-unit: var(--text-primary);
		--trend-1: var(--amber);
		--trend-2: #993c1d;
		--trend-3: var(--success);
		--trend-4: #534ab7;
		--chart-grid-line: color-mix(in srgb, var(--border-default) 44%, transparent);

		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		padding: var(--sp-5) var(--sp-6);
	}

	.report-chart-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		border-bottom: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
		padding-bottom: 14px;
	}

	.report-chart-section h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: var(--font-weight-semibold);
		line-height: 1;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.report-chart-meta {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-2);
		min-width: 0;
	}

	.chart-kicker,
	.chart-status {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.screen-reader-text {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	:root[data-theme='dark'] .report-chart-section {
		--trend-unit: var(--text-primary);
		--trend-2: #ed9d80;
		--trend-3: #9cc87b;
		--trend-4: #b8b0ff;
	}

	@media (max-width: 720px) {
		.report-chart-section {
			padding: var(--sp-4);
		}

		.report-chart-header {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
