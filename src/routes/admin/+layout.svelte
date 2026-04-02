<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import AdminSearch from '$lib/components/admin/AdminSearch.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { children, data } = $props();
	let menuOpen = $state(false);

	function isActive(href: string): boolean {
		if (href === '/admin') return $page.url.pathname === '/admin';
		return $page.url.pathname.startsWith(href);
	}

	function formatRole(role: string | null | undefined): string {
		return role ? role.replace(/_/g, ' ').toUpperCase() : 'ADMIN';
	}

	afterNavigate(() => {
		menuOpen = false;
	});
</script>

<div class="platform-admin-layout">
	<div class="platform-admin-mobilebar">
		<button
			class="platform-admin-mobilebar__toggle"
			onclick={() => (menuOpen = !menuOpen)}
			aria-label="Toggle navigation"
		>
			{#if menuOpen}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
			{/if}
		</button>
		<div class="platform-admin-mobilebar__copy">
			<p>Platform Admin</p>
			<strong>Control Room</strong>
		</div>
		<span class="platform-admin-role">{formatRole(data.adminRole)}</span>
	</div>

	{#if menuOpen}
		<button class="platform-admin-overlay" onclick={() => (menuOpen = false)} aria-label="Close navigation"></button>
	{/if}

	<aside class="platform-admin-sidebar" class:open={menuOpen}>
		<div class="platform-admin-sidebar__header">
			<p class="platform-admin-sidebar__eyebrow">Troop To Task</p>
			<h1>Platform Admin</h1>
			<p class="platform-admin-sidebar__meta">
				Internal control surfaces for platform operations, trust, and subscription support.
			</p>
		</div>

		<nav class="platform-admin-nav" aria-label="Admin sections">
			{#each data.visibleNavGroups as group}
				{#if group.label}
					<p class="platform-admin-nav__label">{group.label}</p>
				{/if}
				{#each group.items as item}
					<a href={item.href} class="platform-admin-nav__item" class:active={isActive(item.href)}>
						<span>{item.label}</span>
					</a>
				{/each}
			{/each}
		</nav>

		<div class="platform-admin-sidebar__footer">
			<div class="platform-admin-sidebar__identity">
				<span class="platform-admin-role">{formatRole(data.adminRole)}</span>
				<p>{data.adminEmail}</p>
			</div>
			<a href="/dashboard" class="platform-admin-exit">
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
		</div>
	</aside>

	<main class="platform-admin-main">
		<div class="platform-admin-main__chrome">
			<div class="platform-admin-main__copy">
				<p class="platform-admin-main__eyebrow">Control Room</p>
				<h2>Platform Oversight</h2>
			</div>
			<div class="platform-admin-main__actions">
				<AdminSearch />
				<button
					class="platform-admin-theme"
					onclick={() => themeStore.toggle()}
					title="Toggle dark/light mode"
					aria-label="Toggle theme"
				>
					{#if themeStore.isDark}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="12" cy="12" r="5" />
							<line x1="12" y1="1" x2="12" y2="3" />
							<line x1="12" y1="21" x2="12" y2="23" />
							<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
							<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
							<line x1="1" y1="12" x2="3" y2="12" />
							<line x1="21" y1="12" x2="23" y2="12" />
							<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
							<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
						</svg>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
						</svg>
					{/if}
				</button>
				<span class="platform-admin-role platform-admin-role--desktop">{formatRole(data.adminRole)}</span>
			</div>
		</div>

		<div class="platform-admin-main__content">
			{@render children()}
		</div>
	</main>
</div>

<style>
	.platform-admin-layout {
		display: flex;
		min-height: 100vh;
		background: var(--surface-page);
	}

	.platform-admin-mobilebar,
	.platform-admin-overlay {
		display: none;
	}

	.platform-admin-sidebar {
		width: 292px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		background: color-mix(in srgb, var(--color-chrome) 96%, black 4%);
		border-right: 1px solid var(--color-chrome-border);
		color: var(--color-chrome-text);
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 40;
	}

	.platform-admin-sidebar__header {
		padding: var(--sp-6);
		border-bottom: 1px solid var(--color-chrome-border);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.platform-admin-sidebar__eyebrow,
	.platform-admin-nav__label,
	.platform-admin-main__eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.platform-admin-sidebar__eyebrow,
	.platform-admin-main__eyebrow {
		color: var(--amber);
	}

	.platform-admin-sidebar__header h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.2rem, 4vw, 3rem);
		line-height: 0.96;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.platform-admin-sidebar__meta {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-chrome-text-muted);
	}

	.platform-admin-nav {
		flex: 1;
		padding: var(--sp-5);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.platform-admin-nav__label {
		margin-top: var(--sp-3);
		color: var(--color-chrome-text-muted);
	}

	.platform-admin-nav__item {
		display: flex;
		align-items: center;
		padding: 0.8rem 0.95rem;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-chrome-text-muted);
		text-decoration: none;
		background: transparent;
	}

	.platform-admin-nav__item:hover {
		color: var(--color-chrome-text);
		background: rgba(255, 255, 255, 0.035);
		border-color: rgba(255, 255, 255, 0.06);
	}

	.platform-admin-nav__item.active {
		color: var(--color-chrome-text);
		background: rgba(var(--amber-rgb), 0.14);
		border-color: rgba(var(--amber-rgb), 0.28);
	}

	.platform-admin-sidebar__footer {
		padding: var(--sp-5);
		border-top: 1px solid var(--color-chrome-border);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.platform-admin-sidebar__identity {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.platform-admin-sidebar__identity p {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--color-chrome-text-muted);
		word-break: break-word;
	}

	.platform-admin-role {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem 0.65rem;
		border: 1px solid rgba(var(--amber-rgb), 0.32);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--amber-dark);
		background: rgba(var(--amber-rgb), 0.1);
		width: fit-content;
	}

	.platform-admin-exit {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-chrome-text);
	}

	.platform-admin-main {
		flex: 1;
		margin-left: 292px;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.platform-admin-main__chrome {
		padding: var(--sp-5);
		border-bottom: var(--border-thin);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		flex-wrap: wrap;
		background: color-mix(in srgb, var(--surface-panel) 94%, var(--surface-subtle) 6%);
	}

	.platform-admin-main__copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.platform-admin-main__copy h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 3vw, 2.7rem);
		line-height: 0.98;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.platform-admin-main__actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex: 1 1 420px;
		justify-content: flex-end;
		min-width: 0;
	}

	.platform-admin-theme,
	.platform-admin-mobilebar__toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-secondary);
	}

	.platform-admin-theme:hover,
	.platform-admin-mobilebar__toggle:hover {
		color: var(--text-primary);
		background: var(--surface-subtle);
	}

	.platform-admin-main__content {
		padding: var(--sp-5);
	}

	.platform-admin-role--desktop {
		display: inline-flex;
	}

	@media (max-width: 900px) {
		.platform-admin-mobilebar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--sp-3);
			padding: var(--sp-4);
			border-bottom: var(--border-thin);
			background: var(--surface-panel);
			position: sticky;
			top: 0;
			z-index: 30;
		}

		.platform-admin-mobilebar__copy {
			display: flex;
			flex-direction: column;
			gap: 2px;
			flex: 1;
		}

		.platform-admin-mobilebar__copy p,
		.platform-admin-mobilebar__copy strong {
			margin: 0;
		}

		.platform-admin-mobilebar__copy p {
			font-family: var(--font-mono);
			font-size: var(--text-xs);
			font-weight: 600;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			color: var(--amber);
		}

		.platform-admin-mobilebar__copy strong {
			font-family: var(--font-display);
			font-size: 1.7rem;
			line-height: 0.96;
			text-transform: uppercase;
			color: var(--text-primary);
		}

		.platform-admin-overlay {
			display: block;
			position: fixed;
			inset: 0;
			border: none;
			background: rgba(14, 14, 13, 0.56);
			z-index: 35;
		}

		.platform-admin-sidebar {
			transform: translateX(-100%);
			transition: transform var(--transition-normal);
			z-index: 40;
		}

		.platform-admin-sidebar.open {
			transform: translateX(0);
		}

		.platform-admin-main {
			margin-left: 0;
		}

		.platform-admin-main__chrome {
			padding: var(--sp-4);
		}

		.platform-admin-main__actions {
			justify-content: stretch;
		}

		.platform-admin-role--desktop {
			display: none;
		}

		.platform-admin-main__content {
			padding: var(--sp-4);
		}
	}
</style>
