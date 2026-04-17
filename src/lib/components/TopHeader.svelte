<script lang="ts">
	import { page } from '$app/stores';
	import type { OrganizationMemberPermissions } from '$lib/types';
	import AvatarMenu from './ui/AvatarMenu.svelte';
	import NotificationBell from './ui/NotificationBell.svelte';
	import { getOrgNavigation, isOrgNavItemActive } from './orgNavigation';

	interface OrgInfo {
		id: string;
		name: string;
		role: string;
	}

	interface Props {
		orgId: string;
		orgName: string;
		userRole: string;
		permissions: OrganizationMemberPermissions;
		allOrgs: OrgInfo[];
		onToggleTheme: () => void;
		isDarkTheme: boolean;
		unreadNotificationCount?: number;
		onFeedback?: () => void;
		onWhatsNew?: () => void;
	}

	let {
		orgId,
		orgName,
		userRole,
		permissions,
		allOrgs,
		onToggleTheme,
		isDarkTheme,
		unreadNotificationCount = 0,
		onFeedback,
		onWhatsNew
	}: Props = $props();

	const pathname = $derived($page.url.pathname);
	const navItems = $derived(getOrgNavigation(orgId, permissions).filter((item) => item.visible));
	const activeNavItem = $derived(navItems.find((item) => isOrgNavItemActive(pathname, item)) ?? navItems[0]);
</script>

<header class="top-header">
	<a href="#main-content" class="skip-link">Skip to main content</a>
	<div class="header-shell">
		<div class="header-left">
			<a href="/org/{orgId}" class="logo-link" aria-label="Troop to Task dashboard">
				<span class="header-mark">T2T</span>
				<span class="header-brand-text">
					<span class="header-logotype">Troop to Task</span>
					<span class="header-active-label">{activeNavItem?.label ?? 'Dashboard'}</span>
				</span>
			</a>

			<div class="header-org-block" aria-label="Current organization">
				<span class="header-org-kicker">Organization</span>
				<span class="header-org-name">{orgName}</span>
			</div>
		</div>

		<nav class="header-nav" aria-label="Primary navigation">
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="nav-tab"
					class:active={isOrgNavItemActive(pathname, item)}
					aria-current={isOrgNavItemActive(pathname, item) ? 'page' : undefined}
				>
					<span class="nav-tab-label">{item.label}</span>
					{#if item.badgeLabel}
						<span class="nav-tab-badge">{item.badgeLabel}</span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="header-right">
			{#if onFeedback}
				<button class="header-feedback-button" type="button" onclick={onFeedback} aria-label="Send feedback">
					Feedback
				</button>
			{/if}
			<NotificationBell {orgId} unreadCount={unreadNotificationCount} />
			<AvatarMenu {orgId} {orgName} {userRole} {allOrgs} {onToggleTheme} {isDarkTheme} {onFeedback} {onWhatsNew} />
		</div>
	</div>
</header>

<style>
	:global(:root) {
		--header-height: 68px;
	}

	.top-header {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: var(--header-height);
		background: var(--color-chrome);
		color: var(--color-chrome-text);
		border-bottom: 1px solid var(--color-chrome-border);
		z-index: calc(var(--z-sticky) + 100);
		box-sizing: border-box;
	}

	.header-shell {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: clamp(var(--sp-4), 2vw, var(--sp-8));
		height: 100%;
		width: 100%;
		box-sizing: border-box;
		padding: 0 clamp(var(--sp-4), 2vw, var(--sp-6));
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: clamp(var(--sp-2), 1.5vw, var(--sp-6));
		min-width: 0;
	}

	.logo-link {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		text-decoration: none;
		color: var(--color-chrome-text);
		min-width: 0;
	}

	.header-mark {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		border: 1px solid rgba(var(--amber-rgb), 0.4);
		color: var(--color-chrome-active);
		padding: 0.4rem 0.5rem;
		border-radius: var(--radius-md);
		line-height: 1;
		flex-shrink: 0;
	}

	.header-brand-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.header-logotype {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: var(--font-weight-display);
		letter-spacing: 0.02em;
		text-transform: uppercase;
		line-height: 0.95;
	}

	.header-active-label,
	.header-org-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		line-height: 1.3;
	}

	.header-active-label {
		color: var(--color-chrome-text-muted);
	}

	.header-org-block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-left: clamp(var(--sp-2), 1vw, var(--sp-4));
		border-left: 1px solid var(--color-chrome-border);
		min-width: 0;
	}

	.header-org-kicker {
		color: var(--color-chrome-text-muted);
	}

	.header-org-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-chrome-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.header-nav::-webkit-scrollbar {
		display: none;
	}

	.nav-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 2.5rem;
		padding: 0 0.875rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--color-chrome-text-muted);
		text-decoration: none;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		box-sizing: border-box;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background var(--transition-fast);
		white-space: nowrap;
	}

	.nav-tab-label {
		display: inline-flex;
		align-items: center;
	}

	.nav-tab-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 18px;
		padding: 1px 6px;
		border: 1px solid rgba(var(--amber-rgb), 0.3);
		border-radius: var(--radius-sm);
		background: rgba(var(--amber-rgb), 0.12);
		color: var(--color-chrome-active);
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
	}

	.nav-tab:hover {
		color: var(--color-chrome-text);
		border-color: rgba(240, 239, 233, 0.12);
		background: rgba(240, 239, 233, 0.03);
	}

	.nav-tab.active {
		color: var(--color-chrome-active);
		border-color: rgba(var(--amber-rgb), 0.42);
		background: rgba(var(--amber-rgb), 0.08);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		justify-self: end;
	}

	.header-feedback-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.25rem;
		padding: 0 0.85rem;
		border: 1px solid var(--color-chrome-border);
		border-radius: var(--radius-md);
		background: rgba(240, 239, 233, 0.03);
		color: var(--color-chrome-text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background var(--transition-fast);
	}

	.header-feedback-button:hover {
		color: var(--color-chrome-text);
		border-color: rgba(240, 239, 233, 0.16);
		background: rgba(240, 239, 233, 0.06);
	}

	.skip-link {
		position: absolute;
		top: -100%;
		left: var(--sp-4);
		background: var(--surface-panel);
		color: var(--text-primary);
		padding: var(--sp-2) var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		z-index: 200;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		text-decoration: none;
	}

	.skip-link:focus {
		top: var(--sp-2);
	}

	@media (max-width: 920px) {
		.header-shell {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.header-nav {
			display: none;
		}
	}

	@media (max-width: 640px) {
		:global(:root) {
			--header-height: 60px;
		}

		.top-header {
			height: var(--header-height);
		}

		.header-shell {
			padding-inline: var(--sp-4);
			gap: var(--sp-2);
		}

		.header-left {
			gap: var(--sp-2);
		}

		.header-logotype {
			font-size: 1.05rem;
		}

		.header-active-label {
			display: none;
		}

		.header-org-block {
			min-width: 0;
			padding-left: var(--sp-2);
		}

		.header-org-kicker {
			display: none;
		}

		.header-org-name {
			font-size: var(--text-xs);
		}

		.header-right {
			gap: var(--sp-1);
		}

		.header-feedback-button {
			display: none;
		}
	}

	@media (max-width: 480px) {
		.header-org-block {
			display: none;
		}
	}
</style>
