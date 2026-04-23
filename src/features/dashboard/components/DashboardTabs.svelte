<script lang="ts">
	import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';
	import type { DashboardPermissions, DashboardTabId } from '../dashboard.types';
	import { hasDashboardPermission } from '../dashboard.types';

	interface Tab {
		id: DashboardTabId;
		label: string;
	}

	interface QuickAction {
		label: string;
		href: string;
		permission?: import('../dashboard.types').DashboardPermission;
	}

	interface Props {
		orgId: string;
		permissions: DashboardPermissions;
	}

	let { orgId, permissions }: Props = $props();

	const TABS: Tab[] = [
		{ id: 'unit-readiness', label: 'Unit Readiness' },
		{ id: 'people-duty', label: 'People & Duty' },
		{ id: 'training-evals', label: 'Training & Evals' }
	];

	const quickActions = $derived<Record<DashboardTabId, QuickAction[]>>({
		'unit-readiness': [{ label: 'Add Calendar Entry', href: `/org/${orgId}/calendar`, permission: 'canViewCalendar' }],
		'people-duty': [
			{ label: 'Onboard Soldier', href: `/org/${orgId}/onboarding`, permission: 'canViewOnboarding' },
			{ label: 'Duty Roster', href: `/org/${orgId}/calendar/duty-roster`, permission: 'canViewCalendar' },
			{ label: 'Add Leave', href: `/org/${orgId}/calendar`, permission: 'canViewCalendar' }
		],
		'training-evals': [
			{ label: 'Record Training', href: `/org/${orgId}/training`, permission: 'canViewTraining' },
			{
				label: 'Add Eval',
				href: `/org/${orgId}/personnel?view=rating-scheme`,
				permission: 'canViewRatingScheme'
			}
		]
	});

	const activeActions = $derived(
		quickActions[dashboardTabStore.activeTab].filter((a) => hasDashboardPermission(permissions, a.permission))
	);
	const activeTabLabel = $derived(
		TABS.find((tab) => tab.id === dashboardTabStore.activeTab)?.label ?? 'dashboard view'
	);
</script>

<!-- Desktop tab bar (rendered in PageToolbar's below slot) -->
<div class="tabs-shell">
	<nav class="dashboard-tab-bar" aria-label="Dashboard views">
		{#each TABS as tab (tab.id)}
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

	{#if activeActions.length > 0}
		<div class="quick-actions" aria-label="Quick actions">
			{#each activeActions as action (action.label)}
				<a href={action.href} class="quick-action">{action.label}</a>
			{/each}
		</div>
	{/if}
</div>

<!-- Mobile pill switcher (rendered inline in content area) -->
<div class="pill-switcher-wrapper" role="group" aria-label="Dashboard views">
	{#each TABS as tab (tab.id)}
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

{#if activeActions.length > 0}
	<div class="quick-actions-mobile" aria-label="Quick actions">
		{#each activeActions as action (action.label)}
			<a href={action.href} class="quick-action">{action.label}</a>
		{/each}
	</div>
{/if}

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

	/* Quick actions strip (desktop) */
	.quick-actions {
		display: flex;
		align-items: center;
		overflow-x: auto;
		scrollbar-width: none;
		padding: var(--sp-2) 0;
		border-bottom: 1px solid var(--border-rule);
	}

	.quick-actions::-webkit-scrollbar {
		display: none;
	}

	.quick-action {
		display: inline-flex;
		align-items: center;
		padding: var(--sp-1) var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber-dark);
		text-decoration: none;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		flex-shrink: 0;
		transition: background var(--transition-fast);
	}

	.quick-action:hover {
		background: var(--amber-light);
	}

	.quick-action + .quick-action {
		position: relative;
	}

	.quick-action + .quick-action::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 1px;
		height: 10px;
		background: var(--ink-15);
	}

	/* ── Mobile pill switcher ─────────────────────────────── */
	.pill-switcher-wrapper {
		display: none;
	}

	.quick-actions-mobile {
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
			margin: var(--sp-4) var(--sp-4) 0;
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

		.quick-actions-mobile {
			display: flex;
			align-items: center;
			overflow-x: auto;
			scrollbar-width: none;
			padding: var(--sp-2) var(--sp-4);
			border-bottom: 1px solid var(--border-rule);
			margin-top: var(--sp-2);
		}

		.quick-actions-mobile::-webkit-scrollbar {
			display: none;
		}

		.quick-actions-mobile .quick-action {
			display: inline-flex;
			align-items: center;
			padding: var(--sp-1) var(--sp-3);
			font-family: var(--font-mono);
			font-size: var(--text-xs);
			font-weight: var(--font-weight-medium);
			letter-spacing: var(--letter-spacing-mono);
			text-transform: uppercase;
			color: var(--amber-dark);
			text-decoration: none;
			border-radius: var(--radius-sm);
			white-space: nowrap;
			flex-shrink: 0;
			transition: background var(--transition-fast);
		}

		.quick-actions-mobile .quick-action:hover {
			background: var(--amber-light);
		}
	}
</style>
