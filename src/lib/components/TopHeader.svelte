<script lang="ts">
	import { page } from '$app/stores';
	import type { OrganizationMemberPermissions } from '$lib/types';
	import AvatarMenu from './ui/AvatarMenu.svelte';
	import NotificationBell from './ui/NotificationBell.svelte';

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
		onWhatsNew
	}: Props = $props();

	const pathname = $derived($page.url.pathname);

	const isDashboardActive = $derived(pathname === `/org/${orgId}`);
	const isCalendarActive = $derived(pathname.startsWith(`/org/${orgId}/calendar`));
	const isPersonnelActive = $derived(pathname.startsWith(`/org/${orgId}/personnel`));
	const isTrainingActive = $derived(pathname.startsWith(`/org/${orgId}/training`));
	const isOnboardingActive = $derived(pathname.startsWith(`/org/${orgId}/onboarding`));
	const isLeadersBookActive = $derived(pathname.startsWith(`/org/${orgId}/leaders-book`));
</script>

<header class="top-header">
	<a href="#main-content" class="skip-link">Skip to main content</a>
	<div class="header-left">
		<a href="/org/{orgId}" class="logo-link">
			<span class="header-mark">T2T</span>
			<span class="header-logotype">Troop to Task</span>
		</a>
		<span class="header-org-name">{orgName}</span>
	</div>

	<nav class="header-nav">
		<a
			href="/org/{orgId}"
			class="nav-tab"
			class:active={isDashboardActive}
			aria-current={isDashboardActive ? 'page' : undefined}
		>
			Dashboard
		</a>
		{#if permissions.canViewCalendar}
			<a
				href="/org/{orgId}/calendar"
				class="nav-tab"
				class:active={isCalendarActive}
				aria-current={isCalendarActive ? 'page' : undefined}
			>
				Calendar
			</a>
		{/if}
		{#if permissions.canViewPersonnel}
			<a
				href="/org/{orgId}/personnel"
				class="nav-tab"
				class:active={isPersonnelActive}
				aria-current={isPersonnelActive ? 'page' : undefined}
			>
				Personnel
			</a>
		{/if}
		{#if permissions.canViewTraining}
			<a
				href="/org/{orgId}/training"
				class="nav-tab"
				class:active={isTrainingActive}
				aria-current={isTrainingActive ? 'page' : undefined}
			>
				Training
			</a>
		{/if}
		{#if permissions.canViewOnboarding}
			<a
				href="/org/{orgId}/onboarding"
				class="nav-tab"
				class:active={isOnboardingActive}
				aria-current={isOnboardingActive ? 'page' : undefined}
			>
				Onboarding
			</a>
		{/if}
		{#if permissions.canViewLeadersBook}
			<a
				href="/org/{orgId}/leaders-book"
				class="nav-tab"
				class:active={isLeadersBookActive}
				aria-current={isLeadersBookActive ? 'page' : undefined}
			>
				Leaders Book
				<span class="beta-badge">Beta</span>
			</a>
		{/if}
	</nav>

	<div class="header-right">
		<NotificationBell {orgId} unreadCount={unreadNotificationCount} />
		<AvatarMenu {orgId} {orgName} {userRole} {allOrgs} {onToggleTheme} {isDarkTheme} {onWhatsNew} />
	</div>
</header>

<style>
	:global(:root) {
		--header-height: 56px;
	}

	.top-header {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: var(--header-height);
		background: #0f0f0f;
		color: #f0ede6;
		border-bottom: 1px solid #2a2a2a;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--spacing-lg);
		z-index: 100;
		box-sizing: border-box;
	}

	/* Left zone */
	.header-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		flex-shrink: 0;
	}

	.logo-link {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		text-decoration: none;
		color: #f0ede6;
	}

	.header-mark {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		background: #b8943e;
		color: #0f0f0f;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		line-height: 1;
	}

	.header-logotype {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
		letter-spacing: -0.01em;
	}

	.header-org-name {
		color: #8a8780;
		font-size: var(--font-size-xs);
	}

	/* Center zone */
	.header-nav {
		display: flex;
		align-items: center;
		height: 100%;
		gap: var(--spacing-xs);
	}

	.nav-tab {
		display: flex;
		align-items: center;
		height: 100%;
		padding: 0 var(--spacing-md);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: #8a8780;
		text-decoration: none;
		border-bottom: 3px solid transparent;
		box-sizing: border-box;
		transition: color var(--transition-fast);
		white-space: nowrap;
	}

	.nav-tab:hover {
		color: #f0ede6;
	}

	.nav-tab.active {
		color: #b8943e;
		border-bottom-color: #b8943e;
	}

	.beta-badge {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: rgba(184, 148, 62, 0.15);
		color: #b8943e;
		padding: 2px 6px;
		border-radius: 3px;
		margin-left: 6px;
	}

	/* Right zone */
	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.skip-link {
		position: absolute;
		top: -100%;
		left: var(--spacing-md);
		background: var(--color-primary);
		color: white;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		z-index: 200;
		font-weight: 600;
		text-decoration: none;
	}

	.skip-link:focus {
		top: var(--spacing-sm);
	}

	/* Mobile (< 640px) */
	@media (max-width: 640px) {
		.header-nav {
			display: none;
		}

		.header-logotype,
		.header-org-name {
			display: none;
		}

		.top-header {
			padding: 0 var(--spacing-md);
		}
	}
</style>
