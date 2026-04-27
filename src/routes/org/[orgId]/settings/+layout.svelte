<script lang="ts">
	import { page } from '$app/stores';
	import { Toolbar, ToolbarNavGroup, type ToolbarNavItem } from '$lib/components/ui/toolbar';

	let { children, data } = $props();
	const currentPath = $derived($page.url.pathname);
	const orgId = $derived($page.params.orgId);

	const settingsSections = $derived<ToolbarNavItem[]>([
		{
			label: 'Overview',
			href: `/org/${orgId}/settings`,
			active: currentPath === `/org/${orgId}/settings`
		},
		...(data.canAccessOrganizationGovernance
			? [
					{
						label: 'Approvals',
						href: `/org/${orgId}/settings/approvals`,
						active: currentPath.includes('/settings/approvals')
					},
					{
						label: 'Archived Personnel',
						href: `/org/${orgId}/settings/archived`,
						active: currentPath.includes('/settings/archived')
					},
					{
						label: 'Audit Log',
						href: `/org/${orgId}/settings/audit`,
						active: currentPath.includes('/settings/audit')
					},
					{
						label: 'Policies',
						href: `/org/${orgId}/settings/policies`,
						active: currentPath.includes('/settings/policies')
					}
				]
			: [])
	]);
</script>

<div class="settings-layout">
	<Toolbar ariaLabel="Organization settings sections" leadingMin="0" collapse="narrow">
		{#snippet leading()}
			<ToolbarNavGroup ariaLabel="Organization settings sections" items={settingsSections} />
		{/snippet}
	</Toolbar>
	<div class="settings-content">
		{@render children()}
	</div>
</div>

<style>
	.settings-layout {
		width: min(1120px, 100%);
		margin: 0 auto;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.settings-content {
		padding: 0;
	}

	@media (max-width: 640px) {
		.settings-layout {
			padding: var(--sp-4);
		}
	}
</style>
