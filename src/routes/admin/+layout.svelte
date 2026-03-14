<script lang="ts">
	import { page } from '$app/stores';
	import AdminSearch from '$lib/components/admin/AdminSearch.svelte';

	let { children, data } = $props();

	const navGroups = [
		{ items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }] },
		{ label: 'SUPPORT', items: [
			{ label: 'Users', href: '/admin/users', page: 'users' },
			{ label: 'Organizations', href: '/admin/organizations', page: 'organizations' },
			{ label: 'Access Requests', href: '/admin/access-requests', page: 'access-requests' },
			{ label: 'Feedback', href: '/admin/feedback', page: 'feedback' },
		]},
		{ label: 'BILLING', items: [
			{ label: 'Subscriptions', href: '/admin/subscriptions', page: 'subscriptions' },
			{ label: 'Gifting', href: '/admin/gifting', page: 'gifting' },
		]},
		{ label: 'SYSTEM', items: [
			{ label: 'Audit Log', href: '/admin/audit', page: 'audit' },
			{ label: 'Announcements', href: '/admin/announcements', page: 'announcements' },
		]},
	];

	const accessiblePages = data.accessiblePages ?? [];

	function isActive(href: string): boolean {
		if (href === '/admin') {
			return $page.url.pathname === '/admin';
		}
		return $page.url.pathname.startsWith(href);
	}

	function getVisibleGroups() {
		return navGroups
			.map(group => ({
				...group,
				items: group.items.filter(item => accessiblePages.includes(item.page))
			}))
			.filter(group => group.items.length > 0);
	}

	const visibleGroups = $derived(getVisibleGroups());
</script>

<div class="admin-layout">
	<aside class="admin-sidebar">
		<div class="sidebar-header">
			<h1>Admin</h1>
		</div>

		<nav class="sidebar-nav">
			{#each visibleGroups as group}
				{#if group.label}
					<div class="nav-group-label">{group.label}</div>
				{/if}
				{#each group.items as item}
					<a
						href={item.href}
						class="nav-item"
						class:active={isActive(item.href)}
					>
						<span>{item.label}</span>
					</a>
				{/each}
			{/each}
		</nav>

		<div class="sidebar-footer">
			<a href="/dashboard" class="back-link">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5M12 19l-7-7 7-7"/>
				</svg>
				Exit Admin
			</a>
			<div class="admin-info">
				<span class="admin-email">{data.adminEmail}</span>
			</div>
		</div>
	</aside>

	<main class="admin-main">
		<div class="admin-header">
			<AdminSearch />
			<div class="admin-header-right">
				<span class="role-badge">{data.adminRole?.toUpperCase().replace('_', ' ')}</span>
			</div>
		</div>
		{@render children()}
	</main>
</div>

<style>
	.admin-layout {
		display: flex;
		min-height: 100vh;
		background: var(--color-bg);
	}

	.admin-sidebar {
		width: 260px;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
	}

	.sidebar-header {
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.sidebar-header h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.sidebar-nav {
		flex: 1;
		padding: var(--spacing-md);
		overflow-y: auto;
	}

	.nav-group-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: var(--spacing-sm) var(--spacing-md);
		margin-top: var(--spacing-md);
		margin-bottom: var(--spacing-xs);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-bottom: var(--spacing-xs);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--color-text-muted);
		font-weight: 500;
		transition: all 0.15s;
	}

	.nav-item:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.nav-item.active {
		background: var(--color-primary);
		color: #0F0F0F;
	}

	.sidebar-footer {
		padding: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--font-size-sm);
		border-radius: var(--radius-md);
		transition: all 0.15s;
	}

	.back-link:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.admin-info {
		margin-top: var(--spacing-sm);
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--color-border);
	}

	.admin-email {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		word-break: break-all;
	}

	.admin-main {
		flex: 1;
		margin-left: 260px;
		padding: var(--spacing-xl);
		overflow-y: auto;
	}

	.admin-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-lg);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.admin-header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.role-badge {
		display: inline-block;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		padding: 2px 8px;
		background: var(--color-primary-bg, #eff6ff);
		color: var(--color-primary);
		border-radius: var(--radius-full);
	}

	@media (max-width: 768px) {
		.admin-sidebar {
			width: 100%;
			position: relative;
			border-right: none;
			border-bottom: 1px solid var(--color-border);
		}

		.admin-layout {
			flex-direction: column;
		}

		.admin-main {
			margin-left: 0;
		}

		.sidebar-nav {
			display: flex;
			flex-wrap: wrap;
			gap: var(--spacing-xs);
			padding: var(--spacing-sm);
		}

		.nav-group-label {
			width: 100%;
			margin-top: var(--spacing-sm);
		}

		.nav-item {
			margin-bottom: 0;
		}
	}
</style>
