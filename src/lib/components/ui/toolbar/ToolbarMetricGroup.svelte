<script lang="ts" module>
	export interface ToolbarMetricItem {
		id: string;
		label: string;
		value: string | number;
		color?: string;
	}
</script>

<script lang="ts">
	interface Props {
		ariaLabel: string;
		items: ToolbarMetricItem[];
	}

	let { ariaLabel, items }: Props = $props();
</script>

<div class="toolbar-metric-group" role="group" aria-label={ariaLabel}>
	{#each items as item (item.id)}
		<div class="toolbar-metric-group__item" style:--toolbar-metric-color={item.color}>
			<span class="toolbar-metric-group__value">{item.value}</span>
			<span class="toolbar-metric-group__label">{item.label}</span>
		</div>
	{/each}
</div>

<style>
	.toolbar-metric-group {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.toolbar-metric-group__item {
		display: inline-flex;
		align-items: baseline;
		gap: var(--sp-2);
		min-height: 34px;
		padding: 5px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.toolbar-metric-group__value {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--toolbar-metric-color, var(--text-primary));
	}

	.toolbar-metric-group__label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
</style>
