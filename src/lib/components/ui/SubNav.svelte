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
	}

	let { tabs, active, onChange }: Props = $props();
</script>

<nav class="sub-nav" aria-label="Secondary navigation">
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
		align-items: center;
		gap: 0;
		overflow-x: auto;
		overflow-y: hidden;
		border-bottom: 1px solid var(--border-default);
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 10px 12px;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		cursor: pointer;
		flex-shrink: 0;
		white-space: nowrap;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background var(--transition-fast);
	}

	.tab:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.sub-nav .tab {
		padding: 10px 14px 11px;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.sub-nav .tab:hover {
		background: color-mix(in srgb, var(--surface-subtle) 70%, transparent);
		color: var(--text-primary);
	}

	.sub-nav .tab.active {
		color: var(--amber-dark);
		border-bottom-color: var(--amber);
	}

	.tab-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 18px;
		padding: 0 5px;
		border-radius: var(--radius-sm);
		border: 1px solid color-mix(in srgb, var(--border-default) 70%, var(--amber) 30%);
		background: color-mix(in srgb, var(--amber-light) 72%, var(--surface-panel) 28%);
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		line-height: 1;
	}

</style>
