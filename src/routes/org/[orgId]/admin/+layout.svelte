<script lang="ts">
	import { page } from '$app/stores';
	import { Toolbar, ToolbarNavGroup, type ToolbarNavItem } from '$lib/components/ui/toolbar';

	let { children } = $props();
	const currentPath = $derived($page.url.pathname);
	const orgId = $derived($page.params.orgId);
	const adminSections = $derived<ToolbarNavItem[]>([
		{
			label: 'Approvals',
			href: `/org/${orgId}/admin/approvals`,
			active: currentPath.includes('/approvals')
		},
		{
			label: 'Archived Personnel',
			href: `/org/${orgId}/admin/archived`,
			active: currentPath.includes('/archived')
		},
		{
			label: 'Audit Log',
			href: `/org/${orgId}/admin/audit`,
			active: currentPath.includes('/audit')
		},
		{
			label: 'Settings',
			href: `/org/${orgId}/admin/settings`,
			active: currentPath.includes('/settings')
		}
	]);
</script>

<div class="admin-layout">
	<Toolbar ariaLabel="Admin sections" leadingMin="0" collapse="narrow">
		{#snippet leading()}
			<ToolbarNavGroup ariaLabel="Admin sections" items={adminSections} />
		{/snippet}
	</Toolbar>
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

	.admin-content {
		padding: 0;
	}

	@media (max-width: 640px) {
		.admin-layout {
			padding: var(--sp-4);
		}
	}
</style>
