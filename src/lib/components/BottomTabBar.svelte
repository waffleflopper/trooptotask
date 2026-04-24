<script lang="ts">
	import { page } from '$app/stores';
	import type { OrganizationMemberPermissions } from '$lib/types';
	import OrgNavIcon from './OrgNavIcon.svelte';
	import { getOrgNavigation, isOrgNavItemActive } from './orgNavigation';

	interface Props {
		orgId: string;
		permissions: OrganizationMemberPermissions;
	}

	let { orgId, permissions }: Props = $props();
	const tabs = $derived(getOrgNavigation(orgId, permissions).filter((item) => item.visible));
</script>

<nav class="bottom-tab-bar" aria-label="Main navigation">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="tab"
			class:active={isOrgNavItemActive($page.url.pathname, tab)}
			aria-current={isOrgNavItemActive($page.url.pathname, tab) ? 'page' : undefined}
		>
			<OrgNavIcon icon={tab.icon} size={24} />
			<span class="tab-copy">
				<span class="tab-label">{tab.compactLabel ?? tab.label}</span>
				{#if tab.badgeLabel}
					<span class="tab-badge">{tab.badgeLabel}</span>
				{/if}
			</span>
		</a>
	{/each}
</nav>

<style>
	.bottom-tab-bar {
		display: none;
	}

	@media (max-width: 920px) {
		.bottom-tab-bar {
			display: flex;
			position: fixed;
			bottom: 0;
			left: 0;
			width: 100%;
			height: calc(64px + env(safe-area-inset-bottom));
			background: var(--color-chrome);
			border-top: 1px solid var(--color-chrome-border);
			padding-bottom: env(safe-area-inset-bottom);
			z-index: calc(var(--z-sticky) + 90);
		}

		.tab {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 4px;
			padding: 8px 0 6px;
			text-decoration: none;
			color: var(--color-chrome-text-muted);
			transition:
				color var(--transition-fast),
				background var(--transition-fast);
			-webkit-tap-highlight-color: transparent;
			position: relative;
		}

		.tab :global(svg) {
			width: 20px;
			height: 20px;
			flex-shrink: 0;
		}

		.tab-label {
			font-family: var(--font-mono);
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.12em;
			line-height: 1;
		}

		.tab-copy {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 4px;
			min-width: 0;
		}

		.tab-badge {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 14px;
			padding: 1px 4px;
			border: 1px solid rgba(var(--amber-rgb), 0.28);
			border-radius: 4px;
			background: rgba(var(--amber-rgb), 0.14);
			color: var(--color-chrome-active);
			font-family: var(--font-mono);
			font-size: 8px;
			font-weight: var(--font-weight-semibold);
			letter-spacing: 0.08em;
			line-height: 1;
			text-transform: uppercase;
			white-space: nowrap;
		}

		.tab::before {
			content: '';
			position: absolute;
			top: 0;
			left: 50%;
			width: 28px;
			height: 2px;
			transform: translateX(-50%);
			background: transparent;
			transition: background var(--transition-fast);
		}

		.tab.active {
			color: var(--color-chrome-active);
			background: rgba(var(--amber-rgb), 0.07);
		}

		.tab.active::before {
			background: var(--color-chrome-active);
		}
	}

	@media (max-width: 640px) {
		.tab :global(svg) {
			width: 20px;
			height: 20px;
		}
	}
</style>
