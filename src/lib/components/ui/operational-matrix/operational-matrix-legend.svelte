<script lang="ts">
	import type { Snippet } from 'svelte';
	import { operationalMatrixStateIcon } from './operational-matrix-state.js';
	import type { OperationalMatrixLegendItem } from './types.js';

	interface Props {
		items?: OperationalMatrixLegendItem[];
		ariaLabel?: string;
		children?: Snippet;
	}

	let { items = [], ariaLabel = 'Operational matrix legend', children }: Props = $props();
</script>

<div class="operational-matrix-legend" data-slot="operational-matrix-legend" aria-label={ariaLabel}>
	{#if children}
		{@render children()}
	{:else}
		{#each items as item (`${item.state}-${item.label}`)}
			<span class="legend-item" data-state={item.state}>
				<span class="legend-mark" aria-hidden="true">{item.icon ?? operationalMatrixStateIcon(item.state)}</span>
				<span>{item.label}</span>
				{#if item.description}
					<span class="legend-description">{item.description}</span>
				{/if}
			</span>
		{/each}
	{/if}
</div>

<style>
	.operational-matrix-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid var(--matrix-rule);
		background: var(--card);
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.legend-description {
		max-width: 18rem;
		overflow: hidden;
		color: var(--muted-foreground);
		font-family: var(--font-sans);
		font-size: 0.75rem;
		font-weight: 400;
		letter-spacing: 0;
		text-overflow: ellipsis;
		text-transform: none;
	}

	.legend-mark {
		display: inline-grid;
		width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		border: 1px solid var(--matrix-rule);
		border-radius: var(--radius-sm);
		background: var(--background);
		color: var(--foreground);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1;
	}

	.legend-item[data-state='complete'] .legend-mark,
	.legend-item[data-state='success'] .legend-mark {
		border-color: color-mix(in srgb, var(--success) 24%, transparent);
		background: var(--success-muted);
		color: var(--success-foreground);
	}

	.legend-item[data-state='warning'] .legend-mark {
		border-color: color-mix(in srgb, var(--warning) 24%, transparent);
		background: var(--warning-muted);
		color: var(--warning-foreground);
	}

	.legend-item[data-state='expired'] .legend-mark,
	.legend-item[data-state='danger'] .legend-mark {
		border-color: color-mix(in srgb, var(--danger) 24%, transparent);
		background: var(--danger-muted);
		color: var(--danger-foreground);
	}

	.legend-item[data-state='assigned'] .legend-mark,
	.legend-item[data-state='info'] .legend-mark {
		border-color: color-mix(in srgb, var(--info) 24%, transparent);
		background: var(--info-muted);
		color: var(--info-foreground);
	}

	.legend-item[data-state='incomplete'] .legend-mark,
	.legend-item[data-state='empty'] .legend-mark,
	.legend-item[data-state='disabled'] .legend-mark {
		background:
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 3px,
				color-mix(in srgb, var(--muted-foreground) 14%, transparent) 3px,
				color-mix(in srgb, var(--muted-foreground) 14%, transparent) 4px
			),
			var(--background);
		color: var(--muted-foreground);
	}
</style>
