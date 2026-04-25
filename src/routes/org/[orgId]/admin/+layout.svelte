<script lang="ts">
	import { page } from '$app/stores';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';

	let { children } = $props();
	const currentPath = $derived($page.url.pathname);
	const orgId = $derived($page.params.orgId);
</script>

<div class="admin-layout">
	<FloatingPageToolbar ariaLabel="Admin sections" leadingMin="0" collapse="narrow">
		{#snippet leading()}
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
		{/snippet}
	</FloatingPageToolbar>
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

		.admin-tabs {
			width: 100%;
		}

		.tab {
			flex: 1 1 50%;
			text-align: center;
		}
	}
</style>
