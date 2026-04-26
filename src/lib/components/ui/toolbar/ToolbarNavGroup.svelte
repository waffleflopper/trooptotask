<script lang="ts">
	export interface ToolbarNavItem {
		label: string;
		href: string;
		active?: boolean;
		disabled?: boolean;
		disabledReason?: string;
	}

	interface Props {
		ariaLabel: string;
		items: ToolbarNavItem[];
		compact?: boolean;
	}

	let { ariaLabel, items, compact = false }: Props = $props();

	function getDisabledReasonId(item: ToolbarNavItem, index: number): string {
		return `toolbar-nav-${item.href.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${index}-reason`;
	}
</script>

<nav class="toolbar-nav-group" class:toolbar-nav-group--compact={compact} aria-label={ariaLabel} data-compact={compact}>
	{#each items as item, index (item.href)}
		{@const disabledReasonId = item.disabledReason ? getDisabledReasonId(item, index) : undefined}
		<a
			class="toolbar-nav-group__item"
			class:active={item.active}
			class:disabled={item.disabled}
			href={item.disabled ? undefined : item.href}
			role={item.disabled ? 'link' : undefined}
			tabindex={item.disabled ? 0 : undefined}
			aria-current={item.active ? 'page' : undefined}
			aria-disabled={item.disabled || undefined}
			aria-describedby={disabledReasonId}
			title={item.disabledReason}
		>
			{item.label}
		</a>
		{#if item.disabledReason}
			<span id={disabledReasonId} class="toolbar-nav-group__reason">{item.disabledReason}</span>
		{/if}
	{/each}
</nav>

<style>
	.toolbar-nav-group {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0;
		width: fit-content;
		max-width: 100%;
		overflow: hidden;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.toolbar-nav-group__item {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 34px;
		padding: 0 var(--sp-3);
		border-right: var(--border-thin);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-decoration: none;
		text-transform: uppercase;
		white-space: nowrap;
		background: transparent;
	}

	.toolbar-nav-group__item:last-child {
		border-right: none;
	}

	.toolbar-nav-group__item:hover {
		color: var(--text-strong);
	}

	.toolbar-nav-group__item.disabled {
		color: var(--text-tertiary);
		cursor: not-allowed;
		opacity: var(--opacity-heavy);
	}

	.toolbar-nav-group__item.disabled:hover {
		color: var(--text-tertiary);
	}

	.toolbar-nav-group__item:focus-visible {
		outline: var(--focus-outline);
		outline-offset: calc(var(--focus-outline-offset) * -1);
	}

	.toolbar-nav-group__item.active {
		color: var(--text-strong);
		background: var(--surface-panel);
	}

	.toolbar-nav-group__reason {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.toolbar-nav-group--compact {
		width: 100%;
	}

	.toolbar-nav-group--compact .toolbar-nav-group__item {
		flex: 1 1 50%;
		text-align: center;
	}

	@media (max-width: 640px) {
		.toolbar-nav-group {
			width: 100%;
		}

		.toolbar-nav-group__item {
			flex: 1 1 50%;
			text-align: center;
		}
	}
</style>
