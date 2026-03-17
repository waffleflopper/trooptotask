<script lang="ts">
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	import AdminSearch from '$lib/components/admin/AdminSearch.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { children, data } = $props();
	let menuOpen = $state(false);

	function isActive(href: string): boolean {
		if (href === '/admin') {
			return $page.url.pathname === '/admin';
		}
		return $page.url.pathname.startsWith(href);
	}

	// Close menu on navigation
	afterNavigate(() => {
		menuOpen = false;
	});
</script>

<div class="admin-layout">
	<!-- Mobile top bar -->
	<div class="mobile-topbar">
		<button class="hamburger" onclick={() => (menuOpen = !menuOpen)} aria-label="Toggle navigation">
			{#if menuOpen}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
				>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line
						x1="3"
						y1="18"
						x2="21"
						y2="18"
					/></svg
				>
			{/if}
		</button>
		<h1>Admin</h1>
		<span class="role-badge">{data.adminRole?.toUpperCase().replace('_', ' ')}</span>
	</div>

	<!-- Overlay backdrop -->
	{#if menuOpen}
		<button class="sidebar-overlay" onclick={() => (menuOpen = false)} aria-label="Close navigation"></button>
	{/if}

	<aside class="admin-sidebar" class:open={menuOpen}>
		<div class="sidebar-header">
			<h1>Admin</h1>
		</div>

		<nav class="sidebar-nav">
			{#each data.visibleNavGroups as group}
				{#if group.label}
					<div class="nav-group-label">{group.label}</div>
				{/if}
				{#each group.items as item}
					<a href={item.href} class="nav-item" class:active={isActive(item.href)}>
						<span>{item.label}</span>
					</a>
				{/each}
			{/each}
		</nav>

		<div class="sidebar-footer">
			<a href="/dashboard" class="back-link">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M19 12H5M12 19l-7-7 7-7" />
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
				<button class="theme-toggle" onclick={() => themeStore.toggle()} title="Toggle dark/light mode">
					{#if themeStore.isDark}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line
								x1="12"
								y1="21"
								x2="12"
								y2="23"
							/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line
								x1="18.36"
								y1="18.36"
								x2="19.78"
								y2="19.78"
							/><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line
								x1="4.22"
								y1="19.78"
								x2="5.64"
								y2="18.36"
							/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg
						>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg
						>
					{/if}
				</button>
				<span class="role-badge desktop-only">{data.adminRole?.toUpperCase().replace('_', ' ')}</span>
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

	/* Mobile top bar — hidden on desktop */
	.mobile-topbar {
		display: none;
	}

	/* Sidebar overlay backdrop — mobile only */
	.sidebar-overlay {
		display: none;
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
		z-index: 100;
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
		color: #0f0f0f;
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

	.theme-toggle {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 6px;
		cursor: pointer;
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.theme-toggle:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
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

	/* ── Mobile ── */
	@media (max-width: 768px) {
		.admin-layout {
			flex-direction: column;
		}

		.mobile-topbar {
			display: flex;
			align-items: center;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm) var(--spacing-md);
			background: var(--color-surface);
			border-bottom: 1px solid var(--color-border);
			position: sticky;
			top: 0;
			z-index: 90;
		}

		.mobile-topbar h1 {
			font-size: var(--font-size-lg);
			font-weight: 700;
			color: var(--color-text);
			margin: 0;
			flex: 1;
		}

		.hamburger {
			background: none;
			border: none;
			padding: var(--spacing-xs);
			cursor: pointer;
			color: var(--color-text);
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.sidebar-overlay {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
			z-index: 99;
			border: none;
			cursor: default;
		}

		.admin-sidebar {
			transform: translateX(-100%);
			transition: transform 0.25s ease;
			width: 280px;
		}

		.admin-sidebar.open {
			transform: translateX(0);
		}

		.admin-main {
			margin-left: 0;
			padding: var(--spacing-md);
		}

		.admin-header {
			flex-direction: column;
			align-items: stretch;
			gap: var(--spacing-sm);
		}

		.admin-header-right {
			justify-content: flex-end;
		}

		.desktop-only {
			display: none;
		}
	}
</style>
