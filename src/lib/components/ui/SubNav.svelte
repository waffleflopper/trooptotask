<script lang="ts">
	interface Tab {
		label: string;
		value: string;
		badge?: number;
	}

	interface Props {
		tabs: Tab[];
		active: string;
		onChange: (value: string) => void;
		variant?: 'underline' | 'pill';
	}

	let { tabs, active, onChange, variant = 'underline' }: Props = $props();
</script>

<nav class="sub-nav {variant}" aria-label="Secondary navigation">
	{#each tabs as tab}
		<button
			type="button"
			class="tab"
			class:active={active === tab.value}
			aria-current={active === tab.value ? 'page' : undefined}
			onclick={() => onChange(tab.value)}
		>
			{tab.label}
			{#if tab.badge != null && tab.badge > 0}
				<span class="tab-badge">{tab.badge}</span>
			{/if}
		</button>
	{/each}
</nav>

<style>
	.sub-nav {
		display: flex;
		gap: var(--spacing-xs);
		overflow-x: auto;
	}

	.tab {
		padding: var(--spacing-xs) var(--spacing-sm);
		background: none;
		border: none;
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background var(--transition-fast);
	}

	/* Underline variant */
	.underline {
		border-bottom: 1px solid var(--color-border);
		gap: 0;
	}

	.underline .tab {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.underline .tab:hover {
		color: var(--color-text);
	}

	.underline .tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	/* Pill variant */
	.pill .tab {
		border-radius: var(--radius-full);
		padding: var(--spacing-xs) var(--spacing-md);
	}

	.pill .tab:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.pill .tab.active {
		background: var(--color-primary);
		color: white;
	}

	.tab-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 var(--spacing-xs);
		border-radius: var(--radius-full);
		background: var(--color-primary);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		margin-left: var(--spacing-xs);
	}

	.pill .tab.active .tab-badge {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
