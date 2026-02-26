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

{#if variant === 'outlined'}
	<span class="badge outlined" style:font-weight={bold ? '700' : '500'}>
		{label}
	</span>
{:else}
	<span
		class="badge"
		style:background-color={color}
		style:color={textColor}
		style:font-weight={bold ? '700' : '500'}
	>
		{label}
	</span>
{/if}

<style>
	.badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		white-space: nowrap;
	}

	.badge.outlined {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
	}
</style>
