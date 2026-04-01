<script lang="ts">
	import { page } from '$app/stores';
	import type { OrganizationMemberPermissions } from '$lib/types';
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
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="24" height="24">
				{#if tab.icon === 'dashboard'}
					<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect
						x="14"
						y="14"
						width="7"
						height="7"
					/><rect x="3" y="14" width="7" height="7" />
				{:else if tab.icon === 'calendar'}
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line
						x1="8"
						y1="2"
						x2="8"
						y2="6"
					/><line x1="3" y1="10" x2="21" y2="10" />
				{:else if tab.icon === 'personnel'}
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
						d="M23 21v-2a4 4 0 0 0-3-3.87"
					/><path d="M16 3.13a4 4 0 0 1 0 7.75" />
				{:else if tab.icon === 'training'}
					<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
				{:else if tab.icon === 'onboarding'}
					<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect
						x="8"
						y="2"
						width="8"
						height="4"
						rx="1"
						ry="1"
					/><path d="M9 14l2 2 4-4" />
				{:else if tab.icon === 'leaders-book'}
					<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path
						d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
					/>
				{/if}
			</svg>
			<span class="tab-label">{tab.compactLabel ?? tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.bottom-tab-bar {
		display: none;
	}

	@media (max-width: 640px) {
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

		.tab svg {
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
</style>
