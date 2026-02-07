<script lang="ts">
	import type { StatusType } from '../types';

	interface Props {
		statusTypes: StatusType[];
	}

	let { statusTypes }: Props = $props();
</script>

<div class="status-legend">
	<span class="legend-label">Status Key:</span>
	<div class="legend-items">
		{#each statusTypes as status (status.id)}
			<div class="legend-item">
				<span class="legend-color" style="background-color: {status.color}"></span>
				<span class="legend-name">{status.name}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.status-legend {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}

	.legend-label {
		font-weight: 600;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.legend-items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm) var(--spacing-md);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.legend-color {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.legend-name {
		color: var(--color-text);
	}
</style>
