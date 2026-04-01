<script lang="ts">
	interface Props {
		label: string;
		color?: string;
		textColor?: string;
		bold?: boolean;
		variant?: 'filled' | 'outlined';
	}

	let { label, color, textColor = 'white', bold = false, variant = 'filled' }: Props = $props();
</script>

<span
	class="badge"
	class:outlined={variant === 'outlined'}
	class:custom-filled={variant === 'filled' && !!color}
	style:background-color={variant === 'filled' && color ? color : undefined}
	style:color={variant === 'filled' && color ? textColor : undefined}
	style:font-weight={bold ? '700' : '600'}
>
	{label}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 22px;
		padding: 3px 8px;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		line-height: 1;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.badge.custom-filled {
		box-shadow: inset 0 0 0 1px rgba(14, 14, 13, 0.06);
	}

	.badge.outlined {
		background: transparent;
		border-color: var(--border-default);
		color: var(--text-secondary);
	}
</style>
