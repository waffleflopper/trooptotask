<script lang="ts">
	import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';
	import { DASHBOARD_TABS } from '../utils/dashboardToolbarActions';

	interface Props {
		orgId: string;
	}

	let { orgId }: Props = $props();

	const activeTabLabel = $derived(
		DASHBOARD_TABS.find((tab) => tab.id === dashboardTabStore.activeTab)?.label ?? 'dashboard view'
	);
</script>

<!-- Desktop tab bar (rendered in the shared route toolbar) -->
<div class="tabs-shell">
	<nav class="dashboard-tab-bar" aria-label="Dashboard views">
		{#each DASHBOARD_TABS as tab (tab.id)}
			<button
				type="button"
				class="dash-tab"
				class:active={dashboardTabStore.activeTab === tab.id}
				aria-current={dashboardTabStore.activeTab === tab.id ? 'page' : undefined}
				onclick={() => dashboardTabStore.setTab(tab.id)}
			>
				{tab.label}
			</button>
		{/each}

		{#if !dashboardTabStore.isDefault}
			<button
				type="button"
				class="set-default-btn"
				aria-label="Set {activeTabLabel} as default dashboard view"
				disabled={dashboardTabStore.saving}
				onclick={() => dashboardTabStore.setDefaultTab(orgId)}
			>
				{dashboardTabStore.saving ? 'Saving…' : 'Set as default'}
			</button>
		{/if}
	</nav>

	{#if dashboardTabStore.error}
		<p class="tab-error" role="status">{dashboardTabStore.error}</p>
	{/if}
</div>

<!-- Mobile pill switcher (rendered inline in content area) -->
<div class="pill-switcher-wrapper" role="group" aria-label="Dashboard views">
	{#each DASHBOARD_TABS as tab (tab.id)}
		<button
			type="button"
			class="pill"
			class:active={dashboardTabStore.activeTab === tab.id}
			onclick={() => dashboardTabStore.setTab(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	/* ── Desktop tab bar ──────────────────────────────────── */
	.tabs-shell {
		display: flex;
		flex-direction: column;
	}

	.dashboard-tab-bar {
		display: flex;
		align-items: center;
		gap: 0;
		overflow-x: auto;
		scrollbar-width: none;
		border-bottom: 1px solid var(--border-default);
	}

	.dashboard-tab-bar::-webkit-scrollbar {
		display: none;
	}

	.dash-tab {
		display: inline-flex;
		align-items: center;
		padding: 10px 14px 11px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		background: none;
		border: 1px solid transparent;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		cursor: pointer;
		white-space: nowrap;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background var(--transition-fast);
	}

	.dash-tab:hover {
		color: var(--text-primary);
		background: color-mix(in srgb, var(--surface-subtle) 70%, transparent);
	}

	.dash-tab.active {
		color: var(--amber-dark);
		border-bottom-color: var(--amber);
	}

	.dash-tab:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.set-default-btn {
		margin-left: auto;
		padding: 4px 10px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-tertiary);
		background: none;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.set-default-btn:hover:not(:disabled) {
		color: var(--text-primary);
		border-color: var(--ink-35);
	}

	.set-default-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.tab-error {
		margin: var(--sp-2) 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--danger);
	}

	/* ── Mobile pill switcher ─────────────────────────────── */
	.pill-switcher-wrapper {
		display: none;
	}

	@media (max-width: 720px) {
		.tabs-shell {
			display: none;
		}

		.pill-switcher-wrapper {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			background: var(--surface-subtle);
			border: 1px solid var(--border-default);
			border-radius: var(--radius-md);
			padding: 3px;
			gap: 3px;
			margin: 0;
		}

		.pill {
			display: flex;
			align-items: center;
			justify-content: center;
			padding: var(--sp-2) var(--sp-3);
			font-family: var(--font-mono);
			font-size: var(--text-xs);
			font-weight: var(--font-weight-semibold);
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-secondary);
			background: transparent;
			border: none;
			border-radius: calc(var(--radius-md) - 2px);
			cursor: pointer;
			text-align: center;
			white-space: nowrap;
			transition:
				background var(--transition-fast),
				color var(--transition-fast);
		}

		.pill.active {
			background: var(--amber);
			color: var(--accent-contrast);
		}

		.pill:focus-visible {
			outline: var(--focus-outline);
			outline-offset: var(--focus-outline-offset);
		}
	}
</style>
