<script lang="ts">
	import { page } from '$app/stores';
	import type { OrganizationMemberPermissions } from '$lib/types';
	import AvatarMenu from './ui/AvatarMenu.svelte';
	import NotificationBell from './ui/NotificationBell.svelte';
	import OrgNavIcon from './OrgNavIcon.svelte';
	import { getOrgBreadcrumbs, getOrgNavigation, isOrgNavItemActive } from './orgNavigation';

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
	const breadcrumbs = $derived(getOrgBreadcrumbs(pathname, orgName, navItems));
</script>

<aside class="app-rail" aria-label="Primary navigation">
	<a href="/org/{orgId}" class="rail-mark-link" aria-label="Troop to Task dashboard">
		<span class="rail-mark">T2T</span>
	</a>

	<nav class="rail-nav">
		{#each navItems as item (item.href)}
			<a
				href={item.href}
				class="rail-item"
				class:active={isOrgNavItemActive(pathname, item)}
				aria-current={isOrgNavItemActive(pathname, item) ? 'page' : undefined}
			>
				<OrgNavIcon icon={item.icon} size={21} strokeWidth={1.9} />
				<span class="rail-item-label">{item.compactLabel ?? item.label}</span>
				{#if item.badgeLabel}
					<span class="rail-badge">{item.badgeLabel}</span>
				{/if}
			</a>
		{/each}
	</nav>

	<div class="rail-menu">
		<AvatarMenu
			{orgId}
			{orgName}
			{userRole}
			{allOrgs}
			{onToggleTheme}
			{isDarkTheme}
			{onFeedback}
			{onWhatsNew}
			menuAlign="left"
			menuSide="top"
		/>
	</div>
</aside>

<header class="top-header">
	<a href="#main-content" class="skip-link">Skip to main content</a>
	<div class="header-shell">
		<div class="header-left">
			<div class="breadcrumb" aria-label="Current section">
				{#each breadcrumbs as crumb, index (`${crumb.label}:${index}`)}
					{#if index === 0}
						{#if crumb.href}
							<a class="breadcrumb-parent breadcrumb-link" href={crumb.href}>{crumb.label}</a>
						{:else}
							<span class="breadcrumb-parent">{crumb.label}</span>
						{/if}
					{:else}
						<span class="breadcrumb-separator">›</span>
						{#if crumb.href}
							<a
								class="breadcrumb-current breadcrumb-link"
								class:breadcrumb-current--section={index < breadcrumbs.length - 1}
								href={crumb.href}>{crumb.label}</a
							>
						{:else}
							<span
								class="breadcrumb-current"
								class:breadcrumb-current--section={index < breadcrumbs.length - 1}
								aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span
							>
						{/if}
					{/if}
				{/each}
			</div>
		</div>

		<div class="header-right">
			{#if onFeedback}
				<button class="header-feedback-button" type="button" onclick={onFeedback} aria-label="Send feedback">
					Feedback
				</button>
			{/if}
			<NotificationBell {orgId} unreadCount={unreadNotificationCount} />
			<a class="header-help-link" href="/help" aria-label="Help">?</a>
			<div class="mobile-account-menu">
				<AvatarMenu {orgId} {orgName} {userRole} {allOrgs} {onToggleTheme} {isDarkTheme} {onFeedback} {onWhatsNew} />
			</div>
		</div>
	</div>
</header>

<style>
	:global(:root) {
		--app-rail-width: 74px;
		--header-height: 52px;
	}

	.app-rail {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: calc(var(--z-sticky) + 120);
		width: var(--app-rail-width);
		display: flex;
		flex-direction: column;
		align-items: stretch;
		padding: var(--sp-3) 0;
		box-sizing: border-box;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0)), var(--color-chrome);
		border-right: 1px solid var(--color-chrome-border);
		color: var(--color-chrome-text-muted);
	}

	.rail-mark-link {
		display: flex;
		justify-content: center;
		padding: var(--sp-1) 0 var(--sp-6);
		text-decoration: none;
	}

	.rail-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 42px;
		min-height: 28px;
		border: 1px solid rgba(var(--amber-rgb), 0.72);
		border-radius: var(--radius-sm);
		color: var(--color-chrome-active);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		line-height: 1;
	}

	.rail-nav {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.rail-item,
	.rail-menu {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 68px;
		padding: 6px 4px;
		text-align: center;
		text-decoration: none;
		color: var(--color-chrome-text-muted);
		transition:
			color var(--transition-fast),
			background var(--transition-fast);
	}

	.rail-item:hover {
		color: var(--color-chrome-text);
		background: rgba(240, 239, 233, 0.04);
	}

	.rail-item.active {
		color: var(--color-chrome-active);
		background: rgba(var(--amber-rgb), 0.08);
	}

	.rail-item.active::before {
		content: '';
		position: absolute;
		left: 0;
		top: 16px;
		bottom: 16px;
		width: 2px;
		background: var(--color-chrome-active);
	}

	.rail-item-label {
		max-width: 64px;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.02em;
		line-height: 1.1;
	}

	.rail-badge {
		color: var(--color-chrome-active);
		font-family: var(--font-mono);
		font-size: 8px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.rail-menu {
		margin-top: auto;
		min-height: 56px;
	}

	.rail-menu :global(.avatar-circle) {
		min-width: 38px;
		height: 34px;
		border-color: rgba(240, 239, 233, 0.16);
		background: rgba(240, 239, 233, 0.04);
		color: var(--color-chrome-text);
	}

	.rail-menu :global(.avatar-circle:hover),
	.rail-menu :global(.avatar-circle.open) {
		border-color: rgba(var(--amber-rgb), 0.42);
		background: rgba(var(--amber-rgb), 0.1);
		color: var(--color-chrome-active);
	}

	.top-header {
		position: fixed;
		top: 0;
		left: var(--app-rail-width);
		width: calc(100% - var(--app-rail-width));
		height: var(--header-height);
		background: color-mix(in srgb, var(--surface-panel) 96%, var(--surface-page) 4%);
		color: var(--text-primary);
		border-bottom: 1px solid var(--border-default);
		z-index: calc(var(--z-sticky) + 100);
		box-sizing: border-box;
	}

	.header-shell {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-4);
		height: 100%;
		width: 100%;
		box-sizing: border-box;
		padding: 0 var(--sp-5);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: clamp(var(--sp-2), 1.5vw, var(--sp-6));
		min-width: 0;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0;
	}

	.breadcrumb-parent {
		color: var(--text-tertiary);
	}

	.breadcrumb-separator {
		color: var(--border-strong);
	}

	.breadcrumb-current {
		color: var(--text-primary);
	}

	.breadcrumb-current--section {
		color: var(--text-secondary);
	}

	.breadcrumb-link {
		text-decoration: none;
		transition: color var(--transition-fast);
	}

	.breadcrumb-link:hover {
		color: var(--text-primary);
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.2em;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		justify-self: end;
		min-width: 0;
	}

	.mobile-account-menu {
		display: none;
	}

	.header-feedback-button {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2.25rem;
		padding: 0 0.85rem;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
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

	.header-help-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
		transition:
			color var(--transition-fast),
			background var(--transition-fast);
	}

	.header-feedback-button:hover,
	.header-help-link:hover {
		color: var(--text-primary);
		background: var(--surface-subtle);
	}

	.header-feedback-button:hover {
		border-color: var(--ink-35);
	}

	.top-header :global(.bell-button) {
		border-color: transparent;
		background: transparent;
		color: var(--text-secondary);
	}

	.top-header :global(.bell-button:hover) {
		border-color: transparent;
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.top-header :global(.bell-button.open) {
		border-color: transparent;
		background: var(--amber-light);
		color: var(--amber-dark);
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
		:global(:root) {
			--header-height: 68px;
		}

		.app-rail {
			display: none;
		}

		.top-header {
			left: 0;
			width: 100%;
			background: var(--color-chrome);
			color: var(--color-chrome-text);
			border-bottom-color: var(--color-chrome-border);
		}

		.header-shell {
			grid-template-columns: minmax(0, 1fr) auto;
			padding: 0 clamp(var(--sp-4), 2vw, var(--sp-6));
		}

		.breadcrumb-parent,
		.breadcrumb-separator {
			display: none;
		}

		.breadcrumb-current {
			font-family: var(--font-display);
			font-size: 1.25rem;
			font-weight: var(--font-weight-display);
			letter-spacing: 0.02em;
			text-transform: uppercase;
			color: var(--color-chrome-text);
		}

		.header-feedback-button {
			border-color: var(--color-chrome-border);
			background: rgba(240, 239, 233, 0.03);
			color: var(--color-chrome-text-muted);
		}

		.top-header :global(.bell-button) {
			border-color: transparent;
			background: rgba(240, 239, 233, 0.03);
			color: var(--color-chrome-text-muted);
		}

		.top-header :global(.bell-button:hover) {
			border-color: transparent;
			background: rgba(240, 239, 233, 0.06);
			color: var(--color-chrome-text);
		}

		.top-header :global(.bell-button.open) {
			border-color: transparent;
			background: rgba(var(--amber-rgb), 0.08);
			color: var(--color-chrome-active);
		}

		.mobile-account-menu {
			display: block;
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

		.header-right {
			gap: var(--sp-1);
		}

		.header-feedback-button {
			display: none;
		}
	}
</style>
