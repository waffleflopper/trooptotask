<script lang="ts">
	import { page } from '$app/stores';
	let { children } = $props();
	const currentPath = $derived($page.url.pathname);
	const orgId = $derived($page.params.orgId);
</script>

<div class="admin-layout">
	<div class="admin-shell">
		<div class="admin-header">
			<div class="header-copy">
				<p class="eyebrow">Admin Area</p>
				<h1>Organization Controls</h1>
			</div>
			<nav class="admin-tabs" aria-label="Admin sections">
				<a href="/org/{orgId}/admin/approvals" class="tab" class:active={currentPath.includes('/approvals')}>
					Approvals
				</a>
				<a href="/org/{orgId}/admin/archived" class="tab" class:active={currentPath.includes('/archived')}>
					Archived Personnel
				</a>
				<a href="/org/{orgId}/admin/audit" class="tab" class:active={currentPath.includes('/audit')}> Audit Log </a>
				<a href="/org/{orgId}/admin/settings" class="tab" class:active={currentPath.includes('/settings')}>
					Settings
				</a>
			</nav>
		</div>
	</div>
	<div class="admin-content">
		{@render children()}
	</div>
</div>

<style>
	.admin-layout {
		width: min(1120px, 100%);
		margin: 0 auto;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.admin-shell {
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.admin-header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.header-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.admin-header h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.2rem, 4vw, 3rem);
		line-height: 0.96;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.admin-tabs {
		display: flex;
		gap: 0;
		flex-wrap: wrap;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		overflow: hidden;
		width: fit-content;
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.tab {
		padding: 0.8rem 1rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		text-decoration: none;
		border-right: var(--border-thin);
		background: transparent;
	}

	.tab:last-child {
		border-right: none;
	}

	.tab:hover {
		color: var(--text-strong);
	}

	.tab.active {
		color: var(--text-strong);
		background: var(--surface-panel);
	}

	.admin-content {
		padding: 0;
	}

	@media (max-width: 640px) {
		.admin-layout {
			padding: var(--sp-4);
		}

		.admin-shell {
			padding: var(--sp-4);
		}

		.admin-tabs {
			width: 100%;
		}

		.tab {
			flex: 1 1 50%;
			text-align: center;
		}
	}
</style>
