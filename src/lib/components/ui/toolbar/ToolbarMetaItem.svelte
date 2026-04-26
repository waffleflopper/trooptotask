<script lang="ts">
	export type ToolbarMetaTone = 'default' | 'warning' | 'success' | 'danger';

	interface Props {
		label: string;
		tone?: ToolbarMetaTone;
	}

	let { label, tone = 'default' }: Props = $props();
</script>

<span class="toolbar-meta-item toolbar-meta-item--{tone}" role="status" aria-label={label}>
	{label}
</span>

<style>
	.toolbar-meta-item {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.toolbar-meta-item--success {
		color: var(--success);
	}

	.toolbar-meta-item--warning {
		color: var(--amber-dark);
	}

	.toolbar-meta-item--danger {
		color: var(--danger);
	}
</style>
