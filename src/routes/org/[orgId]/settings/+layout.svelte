<script lang="ts">
	import { page } from '$app/stores';
	import type { LayoutProps } from './$types';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as PageShell from '$lib/components/ui/page-shell/index.js';

	let { children }: LayoutProps = $props();

	const settingsData = $derived($page.data);
	const settingsShell = $derived(settingsData.settingsShell);
	const organization = $derived(settingsShell?.organization);
	const currentMember = $derived(settingsShell?.currentMember);
	const baseHref = $derived(`/org/${organization?.urlSegment ?? $page.params.orgId}/settings`);
	const activePath = $derived($page.url.pathname);
	const tabs = $derived(
		[
			{ label: 'General', href: `${baseHref}/general`, active: activePath.endsWith('/settings/general') },
			{ label: 'Billing', href: `${baseHref}/billing`, active: activePath.endsWith('/settings/billing') },
			{
				label: 'Members',
				href: `${baseHref}/members`,
				active: activePath.endsWith('/settings/members'),
				badge: settingsShell?.navBadges.pendingInvitationsCount || undefined,
				badgeVariant: 'warning' as const
			},
			{ label: 'Policies', href: `${baseHref}/policies`, active: activePath.endsWith('/settings/policies') },
			...(settingsShell?.tabVisibility.ranks
				? [{ label: 'Ranks', href: `${baseHref}/ranks`, active: activePath.endsWith('/settings/ranks') }]
				: []),
			{
				label: 'Archives',
				href: `${baseHref}/archives`,
				active: activePath.endsWith('/settings/archives'),
				badge: settingsShell?.navBadges.archivedPersonnelCount || undefined,
				badgeVariant: 'outline' as const
			},
			{
				label: 'Approvals',
				href: `${baseHref}/approvals`,
				active: activePath.endsWith('/settings/approvals'),
				badge: settingsShell?.navBadges.pendingApprovalsCount || undefined,
				badgeVariant: 'warning' as const
			},
			...(settingsShell?.tabVisibility.logs
				? [{ label: 'Logs', href: `${baseHref}/logs`, active: activePath.endsWith('/settings/logs') }]
				: []),
			{ label: 'Exports', href: `${baseHref}/exports`, active: activePath.endsWith('/settings/exports') },
			...(settingsShell?.tabVisibility.danger
				? [{ label: 'Danger', href: `${baseHref}/danger`, active: activePath.endsWith('/settings/danger') }]
				: [])
		].map((tab) => ({
			...tab,
			active: tab.active || (activePath.endsWith('/settings') && tab.label === 'General')
		}))
	);
</script>

<svelte:head>
	<title>Settings - {organization?.name ?? 'Organization'} - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide" bodyClass="gap-5">
	<PageShell.Header
		title="Organization Settings"
		subtitle={`${organization?.name ?? 'Organization'} governance, access, policies, retention, and export controls.`}
	>
		{#snippet meta()}
			<Badge variant="outline">{currentMember?.isOwner ? 'Owner access' : 'Admin access'}</Badge>
		{/snippet}
	</PageShell.Header>

	<PageShell.Tabs items={tabs as never} label="Organization settings sections" />

	{@render children()}
</PageShell.Root>
