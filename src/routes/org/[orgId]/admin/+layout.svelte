<script lang="ts">
	import { page } from '$app/stores';
	let { children } = $props();
	const currentPath = $derived($page.url.pathname);
	const orgId = $derived($page.params.orgId);
</script>

<div class="admin-layout">
	<nav class="admin-tabs">
		<a href="/org/{orgId}/admin/approvals" class="tab" class:active={currentPath.includes('/approvals')}>
			Approvals
		</a>
		<a href="/org/{orgId}/admin/audit" class="tab" class:active={currentPath.includes('/audit')}>
			Audit Log
		</a>
	</nav>
	<div class="admin-content">
		{@render children()}
	</div>
</div>

<style>
	.admin-layout {
		max-width: 960px;
		margin: 0 auto;
	}

	.admin-tabs {
		display: flex;
		gap: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-lg);
	}

	.tab {
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.admin-content {
		padding: 0;
	}
</style>
