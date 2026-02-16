<script lang="ts">
	import { page } from '$app/stores';

	let { children, data } = $props();

	const navItems = [
		{ href: '/admin', label: 'Dashboard', icon: 'dashboard' },
		{ href: '/admin/users', label: 'Users', icon: 'users' },
		{ href: '/admin/revenue', label: 'Revenue', icon: 'revenue' },
		{ href: '/admin/audit', label: 'Audit Log', icon: 'audit' }
	];

	function isActive(href: string): boolean {
		if (href === '/admin') {
			return $page.url.pathname === '/admin';
		}
		return $page.url.pathname.startsWith(href);
	}
</script>

<div class="admin-layout">
	<aside class="admin-sidebar">
		<div class="sidebar-header">
			<h1>Admin</h1>
			<span class="role-badge">{data.adminRole?.replace('_', ' ')}</span>
		</div>

		<nav class="sidebar-nav">
			{#each navItems as item}
				<a
					href={item.href}
					class="nav-item"
					class:active={isActive(item.href)}
				>
					{#if item.icon === 'dashboard'}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="3" width="7" height="7"></rect>
							<rect x="14" y="3" width="7" height="7"></rect>
							<rect x="14" y="14" width="7" height="7"></rect>
							<rect x="3" y="14" width="7" height="7"></rect>
						</svg>
					{:else if item.icon === 'users'}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
							<circle cx="9" cy="7" r="4"></circle>
							<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
							<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
						</svg>
					{:else if item.icon === 'revenue'}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="1" x2="12" y2="23"></line>
							<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
						</svg>
					{:else if item.icon === 'audit'}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
							<line x1="16" y1="13" x2="8" y2="13"></line>
							<line x1="16" y1="17" x2="8" y2="17"></line>
							<polyline points="10 9 9 9 8 9"></polyline>
						</svg>
					{/if}
					<span>{item.label}</span>
				</a>
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
		margin-bottom: var(--spacing-xs);
	}

	.role-badge {
		display: inline-block;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: capitalize;
		padding: 2px 8px;
		background: var(--color-primary-bg, #eff6ff);
		color: var(--color-primary);
		border-radius: var(--radius-full);
	}

	.sidebar-nav {
		flex: 1;
		padding: var(--spacing-md);
		overflow-y: auto;
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
		color: white;
	}

	.nav-item svg {
		flex-shrink: 0;
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

		.nav-item {
			margin-bottom: 0;
		}
	}
</style>
