<script lang="ts">
	import type { StatusType } from '$lib/types';

	interface Props {
		statusTypes: StatusType[];
	}

	let { statusTypes }: Props = $props();
</script>

<div class="status-legend" role="region" aria-label="Status color legend">
	<span class="legend-label">Status Key:</span>
	<div class="legend-items">
		{#each statusTypes as status (status.id)}
			<div class="legend-item">
				<span class="legend-color" style="background-color: {status.color}" aria-hidden="true"></span>
				<span class="legend-name">{status.name}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.status-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--sp-3) var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
	}

	.legend-label {
		padding-top: 2px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.legend-items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2) var(--sp-3);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 24px;
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px rgba(14, 14, 13, 0.12);
		flex-shrink: 0;
	}

	.legend-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-primary);
	}
</style>
